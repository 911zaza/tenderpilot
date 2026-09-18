# tasks.md — TenderPilot

Une tâche = une demande à l'assistant = un commit. Cochée seulement quand vérifiée (testée, pas juste écrite).
Ordre pensé pour la grille de notation : profondeur agentique (30%) et produit fonctionnel (25%) d'abord.

## 0. Socle technique

- [ ] Arborescence du repo : `apps/web` (React+Vite), `apps/api` (Fastify+LangGraph), `docker-compose.yml`, `.env.example`
- [ ] `docker-compose.yml` : services `web`, `api`, `postgres` (+pgvector), `redis`, `worker` — `docker compose up` démarre tout
- [ ] Schéma Postgres initial : `entreprises`, `avis`, `exigences`, `references`, `corrections`, table de checkpoints LangGraph
- [ ] Client LLM générique (endpoint Numeos, compatible OpenAI) avec sélection de modèle par appel (gpt-5.5 / gpt-4.1)
- [ ] Script de seed : charge `profil-entreprise.json` en base au démarrage

## 1. Extractor (EX-01, EX-02, EX-03, EX-07)

- [ ] Upload d'un PDF depuis l'interface → stocké, job créé (BullMQ)
- [ ] Extraction de la couche texte avec numéro de page par bloc (unpdf/pdf-parse)
- [ ] Détection des pages sans texte → déclenche l'OCR (Tesseract), résultat mis en cache Redis par hash du PDF
- [ ] Prompt d'extraction structurée (GPT-4.1) : exigence + article + type (obligatoire/optionnel/éliminatoire) + page source
- [ ] Détection des exigences éliminatoires non numérotées (ex. seuil de note technique en fin d'article)
- [ ] Test sur AO-2026-001 (texte) ET AO-2026-004 ou 009 (scan intégral) → vérifier que les pages non lues sont signalées, pas inventées

## 2. Qualifier (EX-04)

- [ ] Outils déterministes : `computeCaMoyenne`, `countValidReferences`, `matchCertification`, `matchEquipe`, `checkEffectif`
- [ ] Logique de classement des exigences (éliminatoire / structurel / administratif / optionnel) — reprise du prototype validé
- [ ] Calcul du verdict go/no-go + liste des blockers triée (éliminatoire d'abord)
- [ ] Génération de la justification en langage naturel (GPT-4.1) à partir du résultat structuré, jamais l'inverse
- [ ] Test sur les 10 avis fournis → comparer au ratio attendu (6 go / 4 no-go, README du jeu de données)

## 3. Interface — matrice de conformité et score (EX-01 à EX-04)

- [ ] Écran d'upload d'un avis PDF
- [ ] Tableau de la matrice de conformité : exigence, type, statut, lien vers la page source (ouvre le PDF à la bonne page)
- [ ] Bandeau score go/no-go avec justification et blockers en tête

## 4. Writer (EX-05)

- [ ] Indexation des références internes et des mémoires passés dans pgvector (embedder-small-3)
- [ ] Génération du mémoire technique section par section, avec citation de la référence utilisée
- [ ] Cas "pas de référence pertinente" → section marquée à compléter, jamais de référence inventée
- [ ] Export DOCX (librairie `docx`)

## 5. Interface de revue (EX-06)

- [ ] Vue section par section du mémoire généré
- [ ] Bouton valider / zone de correction par section
- [ ] Persistance de la correction, réutilisée dans la génération des sections suivantes du même dossier

## 6. Compliance

- [ ] Checklist des pièces attendues vs pièces produites
- [ ] Refus de validation si pièce manquante, avec message explicite (pas de blocage silencieux)

## 7. Orchestrator (LangGraph)

- [ ] Graphe complet : Extractor → Qualifier → (revue humaine) → Writer → Compliance → export
- [ ] Checkpointer Postgres : reprise sans tout relancer après un échec
- [ ] Politique de retry bornée (N tentatives) puis escalade humaine explicite

## 8. Fiabilisation (samedi matin)

- [ ] Rejouer les 10 dossiers fournis, vérifier zéro exigence inventée sur les scans dégradés
- [ ] Vérifier qu'aucune clé API n'est trackée par git (`git log -p | grep -i api_key` doit être vide)
- [ ] README complet : problème, architecture, lancement (`docker compose up`)

## 9. Livraison

- [ ] Répétition de la démo (cas non préparé, montrer le raisonnement pas juste le résultat)
- [ ] Tournage de la vidéo de 2 minutes (15s problème + démo)
- [ ] Dernier commit + lien vidéo déposés avant la deadline
