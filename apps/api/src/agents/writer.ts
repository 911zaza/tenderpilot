import { callVolumeModel, embedText } from "../llm/client.js";
import { query } from "../db/client.js";
import type { Exigence, ProfilEntreprise } from "../types.js";

export interface SectionMemoire {
  ordre: number;
  titre: string;
  contenu: string;
  referencesCitees: string[];
  aCompleter: boolean;
}

const SECTIONS_STANDARD = [
  "Compréhension du besoin et méthodologie",
  "Équipe mobilisée",
  "Références similaires",
  "Plan d'assurance qualité",
  "Planning d'exécution proposé",
];

/**
 * Retrouve les références internes les plus pertinentes par similarité vectorielle (pgvector),
 * plutôt que de laisser le modèle "se souvenir" de références qu'il n'a pas sous les yeux.
 */
async function rechercherReferencesPertinentes(entrepriseId: string, requete: string, topK = 3) {
  const embedding = await embedText(requete);
  const vecteur = `[${embedding.join(",")}]`;
  return query<{ ref_id: string; objet: string; secteur: string; montant_ht_mad: number }>(
    `SELECT ref_id, objet, secteur, montant_ht_mad
     FROM references_internes
     WHERE entreprise_id = $1
     ORDER BY embedding <-> $2
     LIMIT $3`,
    [entrepriseId, vecteur, topK],
  );
}

export async function redigerMemoire(
  entrepriseId: string,
  exigences: Exigence[],
  profil: ProfilEntreprise,
  corrections: Record<string, string> = {}, // titre de section -> contenu corrigé précédemment par l'humain
): Promise<SectionMemoire[]> {
  const sections: SectionMemoire[] = [];

  for (const [i, titre] of SECTIONS_STANDARD.entries()) {
    if (corrections[titre]) {
      // Une correction humaine déjà validée n'est jamais réécrite par le Writer (voir EX-06 / spec.md story 5)
      sections.push({ ordre: i, titre, contenu: corrections[titre], referencesCitees: [], aCompleter: false });
      continue;
    }

    const referencesPertinentes = await rechercherReferencesPertinentes(entrepriseId, titre);

    if (titre === "Références similaires" && referencesPertinentes.length === 0) {
      // Pas de référence interne pertinente -> jamais d'invention, section marquée à compléter (spec.md §5)
      sections.push({
        ordre: i,
        titre,
        contenu: "Aucune référence interne pertinente trouvée pour ce secteur. Section à compléter par l'humain.",
        referencesCitees: [],
        aCompleter: true,
      });
      continue;
    }

    const contexteReferences = referencesPertinentes
      .map((r) => `${r.ref_id} — ${r.objet} (secteur ${r.secteur}, ${r.montant_ht_mad} MAD)`)
      .join("\n");

    const contenu = await callVolumeModel([
      {
        role: "system",
        content:
          "Tu rédiges la section d'un mémoire technique de réponse à un appel d'offres marocain. " +
          "Tu ne cites QUE les références fournies ci-dessous, jamais une référence non listée. " +
          "Style factuel et professionnel, 150-250 mots.",
      },
      {
        role: "user",
        content: `Section à rédiger : "${titre}"\n\nExigences pertinentes:\n${exigences
          .filter((e) => e.type !== "optionnelle")
          .map((e) => `- ${e.texte}`)
          .join("\n")}\n\nRéférences internes disponibles:\n${contexteReferences || "(aucune)"}`,
      },
    ]);

    sections.push({
      ordre: i,
      titre,
      contenu,
      referencesCitees: referencesPertinentes.map((r) => r.ref_id),
      aCompleter: false,
    });
  }

  return sections;
}
