# Use cases — prototype de qualification

Validation de la logique de l'agent Qualifier sur 2 dossiers réels du jeu de données,
avant de la coder dans le pipeline TypeScript/LangGraph final.
Script : `qualifier_prototype.py`.

## Cas 1 — AO-2026-001 (Ministère de l'Éducation Nationale, maintenance applicative)

**Verdict : NO-GO**

| Exigence | Type | Résultat |
|---|---|---|
| CA > 12 778 000 MAD | ÉLIMINATOIRE | ✓ (moyenne 51,8M MAD) |
| ISO 9001:2015 | ÉLIMINATOIRE | ✓ |
| Attestations fiscale/CNSS/déclaration | ADMIN | ✓ (renouvelables) |
| 4 références secteur éducation attestées | STRUCTUREL | **✗ — seulement 2 sur 4** (REF-02, REF-14) |
| Effectif ≥ 60 | STRUCTUREL | ✓ (84) |
| Équipe (chef de projet, architecte, dev, qualité) | STRUCTUREL | ✓ |
| Note technique ≥ 60/85 | ÉLIMINATOIRE (cachée, non numérotée) | Non évaluable avant rédaction — signalée comme risque |

**Blocker retenu** : capacité de références insuffisante, non réparable avant la deadline.

## Cas 2 — AO-2026-002 (ONDA, migration cloud souverain)

**Verdict : NO-GO**

| Exigence | Type | Résultat |
|---|---|---|
| CA > 3 974 000 MAD | ÉLIMINATOIRE | ✓ |
| **ISO 22301:2019** | ÉLIMINATOIRE | **✗ — absente du profil** (qui a ISO 9001, ISO 27001, Qualiopi) |
| 2 références secteur transport attestées | STRUCTUREL | ✓ (4 disponibles) |
| Effectif ≥ 60 | STRUCTUREL | ✓ |
| 4 ingénieurs développement | STRUCTUREL | ✗ (2 seulement dispo) — second signal indépendant |

**Blocker retenu** : certification obligatoire non détenue — no-go immédiat, indépendant du cas 1.

## Ce que ça valide pour le code final

- Le modèle à 4 classes (ÉLIMINATOIRE / OBLIGATOIRE_STRUCT / OBLIGATOIRE_ADMIN / OPTIONNELLE) capture des
  blockers de nature différente sans logique ad hoc par dossier.
- L'Extractor doit sortir des champs génériques (seuil CA, nom de certification, critères de référence,
  seuil effectif, composition d'équipe) — jamais de valeurs codées en dur.
- Le seuil de note technique non numéroté (art. 6, en fin de paragraphe) doit être détecté par l'Extractor
  même sans numérotation explicite : c'est le cas "exigence éliminatoire cachée" du cahier des charges.
