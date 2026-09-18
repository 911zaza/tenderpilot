// Contrat de données entre Extractor et Qualifier — voir design.md §1 et §3.

export type TypeExigence = "eliminatoire" | "obligatoire" | "optionnelle";

export type Regle =
  | { kind: "ca_min"; seuilMad: number }
  | { kind: "certification"; nom: string }
  | { kind: "references"; secteur: string; min: number; anneeMin: number; attestationRequise: boolean }
  | { kind: "effectif_min"; seuil: number }
  | { kind: "equipe"; postes: { poste: string; min: number; experienceMinAnnees: number }[] }
  | { kind: "note_technique_min"; seuil: number; sur: number };

export interface Exigence {
  id: string;
  article: string | null;
  type: TypeExigence;
  texte: string;
  pageSource: number | null;
  pageIllisible: boolean;
  regle: Regle | null; // null = pas de règle reconnue automatiquement -> à vérifier par un humain
  confiance: number;   // 0-1, baissée quand l'extraction est ambiguë (page dégradée, formulation atypique)
}

export type StatutExigence = "satisfaite" | "non_satisfaite" | "a_verifier" | "non_evaluable";

export interface ResultatExigence {
  exigence: Exigence;
  statut: StatutExigence;
  detail: string;
}

export interface ProfilEntreprise {
  raison_sociale: string;
  chiffre_affaires_ht_mad: Record<string, number>;
  certifications: string[];
  attestations_disponibles: string[];
  effectif: number;
  references: {
    id: string;
    secteur: string;
    annee_debut: number;
    attestation_bonne_execution: boolean;
    objet: string;
    montant_ht_mad: number;
  }[];
  equipe: { id: string; poste: string; annees_experience: number }[];
}
