import type { Exigence, ProfilEntreprise, ResultatExigence, StatutExigence } from "../types.js";
import { callVolumeModel } from "../llm/client.js";

/**
 * Logique déterministe de qualification — portée du prototype validé sur AO-2026-001 et AO-2026-002
 * (voir use-cases.md sur la branche prototype/qualification). Aucun appel LLM ici : uniquement du calcul
 * vérifiable. Le LLM n'intervient qu'ensuite, pour formuler la justification en langage naturel.
 */
export function evaluerExigence(exigence: Exigence, profil: ProfilEntreprise): ResultatExigence {
  if (exigence.pageIllisible) {
    return { exigence, statut: "non_evaluable", detail: "Page source illisible, à vérifier manuellement." };
  }
  if (!exigence.regle) {
    return { exigence, statut: "a_verifier", detail: "Exigence non convertible en règle automatique — jugement humain requis." };
  }

  const regle = exigence.regle;

  switch (regle.kind) {
    case "ca_min": {
      const valeurs = Object.values(profil.chiffre_affaires_ht_mad);
      const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
      const ok = moyenne > regle.seuilMad;
      return {
        exigence,
        statut: ok ? "satisfaite" : "non_satisfaite",
        detail: `moyenne 3 ans = ${moyenne.toLocaleString("fr-FR")} MAD (seuil ${regle.seuilMad.toLocaleString("fr-FR")})`,
      };
    }

    case "certification": {
      const ok = profil.certifications.includes(regle.nom);
      return {
        exigence,
        statut: ok ? "satisfaite" : "non_satisfaite",
        detail: ok ? `certification '${regle.nom}' présente` : `certification '${regle.nom}' ABSENTE du profil`,
      };
    }

    case "references": {
      const valides = profil.references.filter(
        (r) =>
          r.secteur === regle.secteur &&
          r.annee_debut >= regle.anneeMin &&
          (!regle.attestationRequise || r.attestation_bonne_execution),
      );
      const ok = valides.length >= regle.min;
      return {
        exigence,
        statut: ok ? "satisfaite" : "non_satisfaite",
        detail: `${valides.length} référence(s) valides secteur '${regle.secteur}' sur ${regle.min} requises — ids: ${valides.map((r) => r.id).join(", ") || "aucune"}`,
      };
    }

    case "effectif_min": {
      const ok = profil.effectif >= regle.seuil;
      return { exigence, statut: ok ? "satisfaite" : "non_satisfaite", detail: `effectif = ${profil.effectif} (seuil ${regle.seuil})` };
    }

    case "equipe": {
      const details: string[] = [];
      let ok = true;
      for (const besoin of regle.postes) {
        const dispo = profil.equipe.filter((c) => c.poste === besoin.poste && c.annees_experience >= besoin.experienceMinAnnees);
        const posteOk = dispo.length >= besoin.min;
        ok = ok && posteOk;
        details.push(`${besoin.poste}: ${dispo.length}/${besoin.min} dispo (>= ${besoin.experienceMinAnnees} ans)`);
      }
      return { exigence, statut: ok ? "satisfaite" : "non_satisfaite", detail: details.join("; ") };
    }

    case "note_technique_min": {
      // Non évaluable avant la rédaction du mémoire par le Writer — remonté comme risque, jamais tranché à tort.
      return {
        exigence,
        statut: "non_evaluable",
        detail: `Dépend de la qualité du mémoire technique (seuil ${regle.seuil}/${regle.sur}) — à surveiller comme garde-fou, pas comme blocker figé.`,
      };
    }
  }
}

export interface VerdictQualification {
  verdict: "go" | "no_go";
  resultats: ResultatExigence[];
  blockers: ResultatExigence[];
  risques: ResultatExigence[];
  justification: string;
}

export async function qualifier(exigences: Exigence[], profil: ProfilEntreprise): Promise<VerdictQualification> {
  const resultats = exigences.map((e) => evaluerExigence(e, profil));

  const blockersEliminatoires = resultats.filter((r) => r.exigence.type === "eliminatoire" && r.statut === "non_satisfaite");
  const blockersStructurels = resultats.filter((r) => r.exigence.type === "obligatoire" && r.statut === "non_satisfaite");
  const risques = resultats.filter((r) => r.statut === "non_evaluable" || r.statut === "a_verifier");

  const blockers = [...blockersEliminatoires, ...blockersStructurels];
  const verdict: "go" | "no_go" = blockers.length > 0 ? "no_go" : "go";

  const justification = await formulerJustification(verdict, blockers, risques);

  return { verdict, resultats, blockers, risques, justification };
}

async function formulerJustification(
  verdict: "go" | "no_go",
  blockers: ResultatExigence[],
  risques: ResultatExigence[],
): Promise<string> {
  if (blockers.length === 0 && risques.length === 0) {
    return "Toutes les exigences vérifiables sont satisfaites. Aucun point bloquant identifié.";
  }

  const resume = [
    `Verdict calculé : ${verdict === "go" ? "GO" : "NO-GO"}.`,
    blockers.length > 0
      ? `Blockers (${blockers.length}) : ${blockers.map((b) => `${b.exigence.article ?? b.exigence.id} — ${b.detail}`).join(" | ")}`
      : "Aucun blocker.",
    risques.length > 0
      ? `Points à vérifier manuellement (${risques.length}) : ${risques.map((r) => r.exigence.texte.slice(0, 80)).join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Le LLM met en forme un texte lisible à partir d'un résultat déjà calculé — il ne décide de rien.
  return callVolumeModel([
    {
      role: "system",
      content:
        "Tu rédiges une justification claire et concise (5-8 lignes) d'un score go/no-go pour un dirigeant de PME " +
        "non juriste, à partir du résumé structuré fourni. Ne change aucun fait, ne minimise aucun blocker, " +
        "mets les points bloquants en premier.",
    },
    { role: "user", content: resume },
  ]);
}
