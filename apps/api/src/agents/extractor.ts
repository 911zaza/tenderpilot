import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore — pas de types officiels pour le build legacy de pdfjs-dist
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { callVolumeModel } from "../llm/client.js";
import type { Exigence } from "../types.js";
import Redis from "ioredis";
import { env } from "../env.js";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);
const redis = new Redis(env.redisUrl);

export interface PageExtraite {
  page: number;
  texte: string;
  illisible: boolean;
}

/**
 * Extrait le texte de chaque page. Une page sans couche texte (scan) est basculée vers l'OCR,
 * avec mise en cache Redis du résultat par hash de fichier (§ "Mettre en cache Redis" du sujet).
 */
export async function extraireTexteParPage(cheminPdf: string): Promise<PageExtraite[]> {
  const buffer = await readFile(cheminPdf);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const cacheKey = `ocr:${hash}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PageExtraite[];
  }

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: PageExtraite[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const texte = content.items.map((item: any) => item.str).join(" ").trim();

    if (texte.length > 20) {
      // couche texte présente et exploitable
      pages.push({ page: i, texte, illisible: false });
    } else {
      // pas de couche texte -> page probablement scannée -> OCR
      const texteOcr = await ocrPage(cheminPdf, i);
      pages.push({
        page: i,
        texte: texteOcr ?? "",
        illisible: !texteOcr || texteOcr.trim().length < 10,
      });
    }
  }

  await redis.set(cacheKey, JSON.stringify(pages), "EX", 60 * 60 * 24 * 7); // 7 jours
  return pages;
}

/**
 * OCR d'une page via poppler (pdftoppm) + tesseract, en ligne de commande (installés dans le Dockerfile).
 * Approche volontairement simple et robuste plutôt qu'un rendu canvas en process.
 */
async function ocrPage(cheminPdf: string, numeroPage: number): Promise<string | null> {
  const dirTemp = await mkdtemp(join(tmpdir(), "tenderpilot-ocr-"));
  const prefixeImage = join(dirTemp, "page");
  try {
    await execFileAsync("pdftoppm", [
      "-f", String(numeroPage),
      "-l", String(numeroPage),
      "-r", "300",
      "-png",
      cheminPdf,
      prefixeImage,
    ]);
    // pdftoppm nomme le fichier avec un suffixe -N ou -0N selon le nombre total de pages
    const { stdout } = await execFileAsync("bash", ["-c", `ls ${prefixeImage}*.png`]);
    const fichierImage = stdout.trim().split("\n")[0];
    if (!fichierImage) return null;

    const { stdout: texte } = await execFileAsync("tesseract", [fichierImage, "stdout", "-l", "fra"]);
    return texte;
  } catch (err) {
    console.error(`OCR échoué page ${numeroPage} de ${cheminPdf} :`, err);
    return null; // signalé comme illisible par l'appelant, jamais une invention de contenu
  } finally {
    await rm(dirTemp, { recursive: true, force: true });
  }
}

const PROMPT_SYSTEME = `Tu es l'agent Extractor de TenderPilot. Tu lis un dossier de consultation d'appel
d'offres marocain (règlement de la consultation + cahier des prescriptions spéciales) et tu en extrais
UNIQUEMENT les exigences réellement écrites dans le texte fourni. N'invente jamais une exigence.

Pour chaque exigence, indique si tu peux la traduire en règle structurée vérifiable automatiquement, parmi :
- ca_min { seuilMad }
- certification { nom }
- references { secteur, min, anneeMin, attestationRequise }
- effectif_min { seuil }
- equipe { postes: [{ poste, min, experienceMinAnnees }] }
- note_technique_min { seuil, sur }

Sois particulièrement attentif aux seuils éliminatoires écrits en fin de paragraphe, sans numéro d'article
(par exemple un seuil de note technique minimale) : ce sont des exigences éliminatoires à part entière.

Réponds en JSON strict : { "exigences": [ { "article", "type", "texte", "regle" | null } ] }
"type" vaut "eliminatoire", "obligatoire" ou "optionnelle".`;

/**
 * Structure les exigences à partir du texte extrait, avec le numéro de page conservé pour la traçabilité (EX-03).
 */
export async function structurerExigences(pages: PageExtraite[]): Promise<Exigence[]> {
  const exigences: Exigence[] = [];

  // Une passe par page conserve un lien fiable exigence -> page source, plutôt qu'une passe globale
  // qui obligerait à redéduire la page a posteriori.
  for (const p of pages) {
    if (p.illisible || p.texte.trim().length < 20) continue;

    const reponse = await callVolumeModel(
      [
        { role: "system", content: PROMPT_SYSTEME },
        { role: "user", content: p.texte },
      ],
      { jsonMode: true, maxTokens: 2048 },
    );

    let parsed: { exigences: any[] };
    try {
      parsed = JSON.parse(reponse);
    } catch {
      console.error(`Réponse Extractor non-JSON pour la page ${p.page}, page ignorée sans invention`);
      continue;
    }

    for (const e of parsed.exigences ?? []) {
      exigences.push({
        id: crypto.randomUUID(),
        article: e.article ?? null,
        type: e.type,
        texte: e.texte,
        pageSource: p.page,
        pageIllisible: false,
        regle: e.regle ?? null,
        confiance: e.regle ? 0.9 : 0.6, // pas de règle reconnue -> confiance réduite, à vérifier par l'humain
      });
    }
  }

  // Les pages illisibles sont explicitement remontées, jamais silencieusement ignorées (EX-07)
  const pagesIllisibles = pages.filter((p) => p.illisible).map((p) => p.page);
  if (pagesIllisibles.length > 0) {
    exigences.push({
      id: crypto.randomUUID(),
      article: null,
      type: "obligatoire",
      texte: `Pages non lues, contenu illisible même après OCR : ${pagesIllisibles.join(", ")}. À vérifier manuellement.`,
      pageSource: null,
      pageIllisible: true,
      regle: null,
      confiance: 0,
    });
  }

  return exigences;
}
