import type { SectionMemoire } from "./writer.js";

export interface ResultatCompliance {
  valide: boolean;
  piecesManquantes: string[];
  sectionsIncompletes: string[];
}

const PIECES_ATTENDUES = [
  "Déclaration sur l'honneur",
  "Attestation fiscale",
  "Attestation CNSS",
  "Certificat du registre de commerce",
];

/**
 * Relit le dossier généré contre la checklist. Règles déterministes uniquement — refuse de valider
 * plutôt que de laisser passer un dossier incomplet (design.md §5).
 */
export function verifierConformite(sections: SectionMemoire[], attestationsDisponibles: string[]): ResultatCompliance {
  const piecesManquantes = PIECES_ATTENDUES.filter((p) => !attestationsDisponibles.includes(p));
  const sectionsIncompletes = sections.filter((s) => s.aCompleter).map((s) => s.titre);

  return {
    valide: piecesManquantes.length === 0 && sectionsIncompletes.length === 0,
    piecesManquantes,
    sectionsIncompletes,
  };
}
