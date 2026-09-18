# TenderPilot

Agent qui traite les appels d'offres publics marocains pour une PME : dépôt d'un avis en PDF, matrice de
conformité avec page source, score go/no-go argumenté, brouillon de mémoire technique, interface de revue.

Hackathon Agentic AI · ESISA × numeOS Technology · édition 2026.

## Le problème

Une PME marocaine brûle 3 à 5 jours-homme par appel d'offres pour lire un CPS de 60 à 100 pages, vérifier son
éligibilité et rédiger le mémoire technique. Voir `spec.md` pour le détail (problème, utilisateur, périmètre).

## Architecture

5 agents à responsabilités séparées, orchestrés par un graphe LangGraph : **Extractor** (parsing + OCR),
**Qualifier** (règles déterministes de qualification), **Writer** (rédaction avec RAG sur les références
internes), **Compliance** (checklist), **Orchestrator** (planification, reprise sur échec). Détail complet
dans `design.md`. Découpage en tâches vérifiables dans `tasks.md`.

## Lancer le projet

```bash
cp .env.example .env   # puis remplir avec les clés reçues par mail (jamais commitées)
docker compose up --build
```

- Frontend : http://localhost:5173
- API : http://localhost:3001

Au premier démarrage, charger le profil entreprise de démonstration :

```bash
docker compose exec api npm run seed -- ./data/profil-entreprise.json
```

## Structure du repo

```
apps/web/    interface React (upload, matrice de conformité, score, revue)
apps/api/    API Fastify + agents + orchestration LangGraph
spec.md      le contrat : problème, user stories, critères d'acceptation, hors-périmètre
design.md    agents, outils déterministes, mémoire, garde-fous
tasks.md     découpage en tâches vérifiables
CLAUDE.md    conventions pour l'assistant de code
```

## Garde-fous

Aucune exigence ni référence n'est inventée : une page illisible est signalée explicitement, une référence
absente marque la section correspondante "à compléter par l'humain". Le calcul de qualification (seuils, CA,
comptage de références, certifications) est déterministe — le modèle ne sert qu'à formuler la justification
en langage naturel à partir d'un résultat déjà calculé. Détail dans `design.md` §5.
