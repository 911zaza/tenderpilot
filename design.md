# design.md — TenderPilot

Architecture cohérente sur 55h. Ce fichier fixe ce qui est agent, ce qui est outil déterministe, ce qui est
mémorisé, et où le système a le droit de refuser plutôt que d'inventer.

## 1. Les agents — un rôle, une entrée, une sortie

| Agent | Entrée | Sortie | Modèle |
|---|---|---|---|
| **Extractor** | PDF de l'avis (texte + scans) | Liste d'exigences structurées `{id, article, type, texte, page_source, confiance}` | GPT-4.1 |
| **Qualifier** | Exigences (Extractor) + profil entreprise (Postgres) | `{verdict: go/no-go, blockers[], justification}` | Règles déterministes + GPT-4.1 (mise en forme) |
| **Writer** | Exigences + profil + go confirmé + corrections humaines précédentes | Mémoire technique en sections, avec citations de références | GPT-4.1 + embeddings (RAG) |
| **Compliance** | Mémoire technique généré + checklist du dossier | `{valide: bool, pieces_manquantes[]}` | Règles déterministes + GPT-4.1 (message d'erreur) |
| **Orchestrator** | État du graphe (LangGraph) | Prochaine étape, ou escalade humaine | GPT-5.5 |

Aucun agent ne fait le travail d'un autre. L'Extractor ne juge pas l'éligibilité, le Qualifier ne rédige rien,
le Writer ne valide pas la conformité de son propre livrable.

## 2. Le graphe (LangGraph)

```
  [Upload PDF]
       |
       v
  +-----------+      pages illisibles/échec OCR répété
  | Extractor |------------------------> [Escalade humaine : "pages non lues"]
  +-----------+
       |  exigences structurées
       v
  +-----------+
  | Qualifier |
  +-----------+
       |  verdict + blockers
       v
  [Revue humaine : score go/no-go affiché, blockers en tête]
       |  (l'humain choisit de continuer même sur no-go, ou s'arrête ici)
       v
  +--------+   section incomplète/référence manquante
  | Writer |-----------------------------> section marquée "à compléter"
  +--------+
       |  brouillon section par section
       v
  +------------+   pièce manquante
  | Compliance |----------------------> [Escalade humaine : liste des pièces à fournir]
  +------------+
       |  dossier validé
       v
  [Interface de revue par section : valider / corriger -> mémorisé pour les sections suivantes]
       |
       v
  [Export DOCX/PDF]
```

L'**Orchestrator** encadre chaque flèche : il relance un agent en échec (jusqu'à N tentatives, avec le
checkpointer Postgres de LangGraph pour reprendre sans tout refaire), et bascule vers l'humain plutôt que de
boucler indéfiniment ou d'inventer un résultat.

## 3. Les outils — ce qui reste du code déterministe, jamais confié au modèle

| Outil | Fait quoi | Utilisé par |
|---|---|---|
| `parseTextLayer(pdf)` | Extraction de la couche texte (unpdf/pdf-parse), avec n° de page à chaque bloc | Extractor |
| `ocrPage(image)` | OCR Tesseract, résultat mis en cache Redis par hash de document | Extractor |
| `computeCaMoyenne(profil)` | Moyenne du CA sur 3 exercices, comparaison au seuil extrait | Qualifier |
| `countValidReferences(profil, secteur, anneeMin, exigeAttestation)` | Filtre et compte les références qualifiantes | Qualifier |
| `matchCertification(profil, nomExige)` | Comparaison exacte du nom de certification | Qualifier |
| `matchEquipe(profil, besoins[])` | Vérifie effectif par poste et années d'expérience | Qualifier |
| `searchReferences(embedding, topK)` | Recherche pgvector des références/mémoires passés les plus proches | Writer |
| `renderDocx(sections)` | Génération du fichier DOCX final (librairie `docx`) | Writer / export |
| `checkChecklist(dossier)` | Comparaison dossier généré vs pièces exigées | Compliance |

Règle : tout ce qui est un calcul, un comptage, une comparaison de seuil ou une génération de fichier passe par
un outil typé et testable — jamais par une génération de texte libre du modèle.

## 4. La mémoire — ce qui est gardé, où, combien de temps

| Donnée | Stockage | Portée |
|---|---|---|
| Profil entreprise (références, CV, attestations, certifications) | PostgreSQL | Permanent, saisi une fois |
| Embeddings des références et mémoires passés | PostgreSQL + pgvector | Permanent, recalculé seulement si le profil change |
| Résultat OCR par document | Redis (cache) | Durée de vie du dossier en traitement — évite de relire 50 fois le même scan |
| Corrections humaines par section du mémoire technique | PostgreSQL | Permanent par dossier, réutilisé pour les sections suivantes du même dossier |
| État et checkpoints du graphe LangGraph | PostgreSQL (checkpointer) | Le temps du traitement, permet la reprise après échec |

## 5. Les garde-fous — où l'agent doit refuser, douter, ou escalader

- **Aucune exigence n'est inventée.** Une page illisible est listée comme "non lue", jamais comblée par une
  supposition. (EX-07)
- **Aucune référence n'est fabriquée.** Si le Writer n'a pas de référence interne pertinente pour une section,
  il marque la section "à compléter par l'humain" plutôt que d'écrire une phrase vague. (scénario jury §6)
- **Le seuil de note technique caché** (souvent en fin d'article, sans numéro) doit être détecté par
  l'Extractor et remonté comme risque explicite au Qualifier, même s'il ne peut pas être évalué avant la
  rédaction du mémoire.
- **Chaque exigence affichée porte un niveau de confiance.** Une correspondance ambiguë (ex. secteur
  "assimilable" mais pas identique) est signalée comme incertaine, pas tranchée silencieusement par le modèle.
- **Compliance ne valide jamais un dossier incomplet** — il bloque et liste précisément la pièce manquante.
- **L'Orchestrator escalade plutôt que de boucler** : un agent qui échoue deux fois de suite sur le même
  document déclenche une alerte humaine explicite, pas une troisième tentative silencieuse.
