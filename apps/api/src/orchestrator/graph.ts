import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { extraireTexteParPage, structurerExigences } from "../agents/extractor.js";
import { qualifier, type VerdictQualification } from "../agents/qualifier.js";
import { redigerMemoire, type SectionMemoire } from "../agents/writer.js";
import { verifierConformite, type ResultatCompliance } from "../agents/compliance.js";
import type { Exigence, ProfilEntreprise } from "../types.js";
import { env } from "../env.js";

const MAX_TENTATIVES = 2;

const EtatGraphe = Annotation.Root({
  avisId: Annotation<string>(),
  entrepriseId: Annotation<string>(),
  cheminPdf: Annotation<string>(),
  profil: Annotation<ProfilEntreprise>(),
  exigences: Annotation<Exigence[]>({ reducer: (_, next) => next, default: () => [] }),
  qualification: Annotation<VerdictQualification | null>({ reducer: (_, next) => next, default: () => null }),
  sections: Annotation<SectionMemoire[]>({ reducer: (_, next) => next, default: () => [] }),
  compliance: Annotation<ResultatCompliance | null>({ reducer: (_, next) => next, default: () => null }),
  tentatives: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  escalade: Annotation<string | null>({ reducer: (_, next) => next, default: () => null }),
});

type Etat = typeof EtatGraphe.State;

async function noeudExtractor(etat: Etat): Promise<Partial<Etat>> {
  try {
    const pages = await extraireTexteParPage(etat.cheminPdf);
    const exigences = await structurerExigences(pages);
    return { exigences };
  } catch (err) {
    if (etat.tentatives + 1 >= MAX_TENTATIVES) {
      return { escalade: `Extractor en échec après ${MAX_TENTATIVES} tentatives : ${err}`, tentatives: etat.tentatives + 1 };
    }
    return { tentatives: etat.tentatives + 1 };
  }
}

async function noeudQualifier(etat: Etat): Promise<Partial<Etat>> {
  const resultat = await qualifier(etat.exigences, etat.profil);
  return { qualification: resultat };
}

async function noeudWriter(etat: Etat): Promise<Partial<Etat>> {
  const sections = await redigerMemoire(etat.entrepriseId, etat.exigences, etat.profil);
  return { sections };
}

async function noeudCompliance(etat: Etat): Promise<Partial<Etat>> {
  const resultat = verifierConformite(etat.sections, etat.profil.attestations_disponibles);
  if (!resultat.valide) {
    return { compliance: resultat, escalade: `Pièces ou sections manquantes : ${[...resultat.piecesManquantes, ...resultat.sectionsIncompletes].join(", ")}` };
  }
  return { compliance: resultat };
}

function apresExtraction(etat: Etat) {
  if (etat.escalade) return END;
  if (etat.exigences.length === 0) return "extractor"; // retry
  return "qualifier";
}

function apresQualification(etat: Etat) {
  // Le graphe s'arrête ici pour la revue humaine (score go/no-go affiché) ; la suite est déclenchée
  // explicitement par l'utilisateur depuis l'interface, jamais automatiquement sur un no-go.
  return END;
}

/**
 * Graphe séparé, à invoquer après confirmation humaine de poursuivre vers la rédaction.
 */
export function construireGrapheRedaction() {
  const graphe = new StateGraph(EtatGraphe)
    .addNode("writer", noeudWriter)
    .addNode("compliance", noeudCompliance)
    .addEdge(START, "writer")
    .addEdge("writer", "compliance")
    .addEdge("compliance", END);

  return graphe;
}

/**
 * Graphe principal : Extractor -> Qualifier -> (arrêt pour revue humaine).
 * Le checkpointer Postgres permet de reprendre un dossier interrompu sans tout refaire (design.md §2).
 */
export async function construireGrapheQualification() {
  const checkpointer = PostgresSaver.fromConnString(env.databaseUrl);
  await checkpointer.setup();

  const graphe = new StateGraph(EtatGraphe)
    .addNode("extractor", noeudExtractor)
    .addNode("qualifier", noeudQualifier)
    .addEdge(START, "extractor")
    .addConditionalEdges("extractor", apresExtraction, { qualifier: "qualifier", [END]: END })
    .addConditionalEdges("qualifier", apresQualification, { [END]: END });

  return graphe.compile({ checkpointer });
}
