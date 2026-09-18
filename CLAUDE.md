# CLAUDE.md — contexte projet pour l'assistant de code

Ce fichier est relu à chaque session. Il ne remplace pas `spec.md` / `design.md` / `tasks.md` — il rappelle
les conventions et les pièges à ne pas répéter.

## Stack

- Frontend : `apps/web` — React 18 + TypeScript (Vite)
- Backend/agents : `apps/api` — Node.js 20 + TypeScript (Fastify) + LangGraph (`@langchain/langgraph`)
- Base de données : PostgreSQL 16 + extension pgvector
- Cache/files : Redis 7 + BullMQ
- LLM : endpoint Numeos compatible OpenAI — voir `.env` pour les clés (jamais en dur dans le code)
- Exécution : Docker Compose, 5 services (`web`, `api`, `postgres`, `redis`, `worker`)

## Répartition des modèles (coûts suivis par Numeos)

- `gpt-5.5` (`LLM_MODEL`) : uniquement l'Orchestrator (planification, décisions multi-étapes)
- `gpt-4.1` (`AZURE_OPENAI_DEPLOYMENT_NAME`) : Extractor, Writer, et la mise en forme de justification du Qualifier/Compliance
- `embedder-small-3` : uniquement pour indexer et rechercher les références internes (RAG), jamais recalculé à chaque requête

## Règles non négociables

- **Aucune clé API en dur dans le code ou committée.** Toujours via `process.env`, jamais de fallback avec une
  valeur réelle. Vérifier `.gitignore` contient `.env` avant chaque commit.
- **Le calcul de qualification (Qualifier) est déterministe.** Comparaisons de seuils, comptages de références,
  correspondance de certifications : du code testable, pas un prompt. Le LLM ne sert qu'à formuler la
  justification en langage naturel à partir du résultat déjà calculé.
- **Jamais d'exigence ou de référence inventée.** Une page illisible ou une référence absente doit produire un
  signal explicite ("non lu", "à compléter"), jamais un contenu plausible non vérifié.
- **Chaque exigence affichée doit porter son numéro de page source**, dès l'extraction — sinon la traçabilité
  ne peut pas être reconstruite plus tard.
- **Une tâche = un commit.** Pas de gros commit fourre-tout en fin de journée.

## Anti-patterns déjà identifiés à éviter

- Ne pas confier au modèle un calcul (TVA, seuil, comptage) — cf. `design.md` §3, ces outils sont typés.
- Ne pas écrire un unique appel LLM qui fait tout (extraction + qualification + rédaction) : l'architecture
  agentique à 5 rôles séparés est une exigence évaluée, pas un détail d'implémentation.
- Ne pas figer `spec.md` après le Checkpoint 1 sans le mettre à jour si le périmètre change réellement.

## Commandes utiles

```bash
docker compose up          # démarre les 5 services
docker compose logs -f api # logs de l'API et des agents
npm run test --workspace=apps/api   # tests de l'agent Qualifier (déterministe, à couvrir en priorité)
```
