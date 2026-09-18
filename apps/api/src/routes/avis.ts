import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "../db/client.js";
import { construireGrapheQualification, construireGrapheRedaction } from "../orchestrator/graph.js";
import { verifierConformite } from "../agents/compliance.js";

const DOSSIER_UPLOADS = "/app/uploads";

export async function routesAvis(app: FastifyInstance) {
  // EX-01 — déposer un avis PDF et déclencher le traitement
  app.post("/avis", async (req, reply) => {
    const fichier = await (req as any).file();
    if (!fichier) return reply.status(400).send({ erreur: "Aucun fichier reçu" });

    const [entreprise] = await query<{ id: string; profil: any }>("SELECT id, profil FROM entreprises LIMIT 1");
    if (!entreprise) return reply.status(500).send({ erreur: "Aucune entreprise en base — lancer le seed" });

    await mkdir(DOSSIER_UPLOADS, { recursive: true });
    const chemin = join(DOSSIER_UPLOADS, `${Date.now()}-${fichier.filename}`);
    await writeFile(chemin, await fichier.toBuffer());

    const [avis] = await query<{ id: string }>(
      `INSERT INTO avis (entreprise_id, nom_fichier, chemin_fichier, statut) VALUES ($1, $2, $3, 'extraction') RETURNING id`,
      [entreprise.id, fichier.filename, chemin],
    );

    const graphe = await construireGrapheQualification();
    const config = { configurable: { thread_id: avis.id } };

    const resultat = await graphe.invoke(
      { avisId: avis.id, entrepriseId: entreprise.id, cheminPdf: chemin, profil: entreprise.profil },
      config,
    );

    if (resultat.escalade) {
      await query(`UPDATE avis SET statut = 'echec', updated_at = now() WHERE id = $1`, [avis.id]);
      return reply.status(200).send({ avisId: avis.id, escalade: resultat.escalade });
    }

    for (const r of resultat.qualification!.resultats) {
      await query(
        `INSERT INTO exigences (avis_id, article, type, texte, page_source, page_illisible, regle, confiance, statut, detail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          avis.id,
          r.exigence.article,
          r.exigence.type,
          r.exigence.texte,
          r.exigence.pageSource,
          r.exigence.pageIllisible,
          r.exigence.regle,
          r.exigence.confiance,
          r.statut,
          r.detail,
        ],
      );
    }

    await query(`UPDATE avis SET statut = 'qualification', verdict = $2, justification = $3, updated_at = now() WHERE id = $1`, [
      avis.id,
      resultat.qualification!.verdict,
      resultat.qualification!.justification,
    ]);

    return reply.send({ avisId: avis.id, verdict: resultat.qualification!.verdict, justification: resultat.qualification!.justification });
  });

  // EX-02 — matrice de conformité
  app.get("/avis/:id/exigences", async (req) => {
    const { id } = req.params as { id: string };
    return query(`SELECT * FROM exigences WHERE avis_id = $1 ORDER BY page_source NULLS LAST`, [id]);
  });

  // EX-04 — score go/no-go
  app.get("/avis/:id", async (req) => {
    const { id } = req.params as { id: string };
    const [avis] = await query(`SELECT * FROM avis WHERE id = $1`, [id]);
    return avis;
  });

  // EX-05 — déclenche la rédaction du mémoire (choix explicite de l'humain, jamais automatique sur no-go)
  app.post("/avis/:id/redaction", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [avis] = await query<{ entreprise_id: string }>(`SELECT entreprise_id FROM avis WHERE id = $1`, [id]);
    const [entreprise] = await query<{ profil: any }>(`SELECT profil FROM entreprises WHERE id = $1`, [avis.entreprise_id]);
    const exigences = await query(`SELECT * FROM exigences WHERE avis_id = $1`, [id]);

    const graphe = construireGrapheRedaction().compile();
    const resultat = await graphe.invoke({
      avisId: id,
      entrepriseId: avis.entreprise_id,
      profil: entreprise.profil,
      exigences,
      sections: [],
    });

    for (const s of resultat.sections as any[]) {
      await query(
        `INSERT INTO sections_memoire (avis_id, ordre, titre, contenu, references_citees, a_completer)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, s.ordre, s.titre, s.contenu, s.referencesCitees, s.aCompleter],
      );
    }

    return reply.send({ sections: resultat.sections, compliance: resultat.compliance });
  });

  // EX-06 — corriger une section, la correction est conservée
  app.put("/avis/:id/sections/:sectionId", async (req) => {
    const { sectionId } = req.params as { id: string; sectionId: string };
    const { contenu } = req.body as { contenu: string };
    await query(`UPDATE sections_memoire SET contenu = $2, statut = 'corrige' WHERE id = $1`, [sectionId, contenu]);
    await query(`INSERT INTO corrections (avis_id, section_id, contenu_corrige) VALUES ((SELECT avis_id FROM sections_memoire WHERE id = $1), $1, $2)`, [
      sectionId,
      contenu,
    ]);
    return { ok: true };
  });
}
