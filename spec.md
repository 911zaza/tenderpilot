# spec.md — TenderPilot

Le contrat : ce qui est fini, ce qui ne l'est pas. Rien ne se code hors de ce périmètre sans repasser par ce fichier.

## 1. Le problème, chiffré

Une PME marocaine de 20 à 200 personnes brûle **3 à 5 jours-homme** par appel d'offres public pour lire un CPS de 60 à 100 pages, vérifier son éligibilité, rassembler un dossier administratif complet et rédiger un mémoire technique. Conséquence : la plupart des PME ne répondent pas, ou répondent mal et sont écartées sur un vice de forme (attestation manquante, exigence éliminatoire non vue).

## 2. L'utilisateur

Le responsable commercial ou le dirigeant d'une PME de services (type Atlas Digital Services SARL, 84 salariés, Casablanca), qui répond à **2 à 10 appels d'offres par mois**. Il connaît très bien son métier et très mal la procédure des marchés publics — il n'est pas juriste.

## 3. La valeur attendue

| | Avant | Après |
|---|---|---|
| Décision go/no-go | 1 à 2 jours de lecture manuelle | **5 minutes**, argumentée, blockers en tête |
| Dossier de réponse | Page blanche, 3-5 jours-homme | Brouillon à **80%**, sections citant les vraies références |
| Traçabilité | À la relecture, a posteriori | Chaque exigence liée à sa page source, dès l'extraction |

Mesure : temps de traitement par dossier, part des exigences couvertes avec leur source citée.

## 4. Le périmètre — user stories retenues

1. **En tant que** dirigeant de PME, **je veux** déposer un avis en PDF et savoir en 5 minutes si je suis éligible, **afin de** ne pas engager 3 jours de travail pour rien.
2. **En tant que** responsable commercial, **je veux** voir chaque exigence avec sa page source, **afin de** vérifier moi-même ce que l'agent a compris.
3. **En tant que** rédacteur, **je veux** un brouillon qui cite nos références réelles, **afin de** ne plus partir d'une page blanche.
4. **En tant que** dirigeant, **je veux** que les points bloquants apparaissent en premier, **afin de** trancher vite le go/no-go.
5. **En tant qu'**utilisateur, **je veux** corriger une section et que la correction soit conservée, **afin de** ne pas refaire deux fois le même travail.

## 5. Critères d'acceptation

- **Étant donné** un avis d'appel d'offres réel en PDF, **quand** l'utilisateur le dépose et lance le traitement, **alors** le système affiche une matrice de conformité listant chaque exigence extraite, typée obligatoire / optionnelle / éliminatoire, avec sa page source cliquable.
- **Étant donné** une matrice de conformité calculée, **quand** l'analyse est terminée, **alors** un score go/no-go s'affiche avec une justification en langage naturel et la liste des points bloquants **en tête**, triés éliminatoire d'abord.
- **Étant donné** un dossier évalué go, **quand** l'utilisateur demande le mémoire technique, **alors** un brouillon structuré en sections est généré, citant les références internes réelles de l'entreprise, exportable en DOCX ou PDF.
- **Étant donné** une section du mémoire affichée en revue, **quand** l'utilisateur la corrige et valide, **alors** la correction est conservée et réutilisée dans les sections suivantes.
- **Étant donné** un PDF partiellement illisible (scan dégradé), **quand** l'Extractor le traite, **alors** le reste du document est traité normalement, les pages non lues sont signalées explicitement, et **aucune exigence n'est inventée**.
- **Étant donné** une exigence sans référence interne correspondante, **quand** le Writer rédige la section concernée, **alors** il ne fabrique pas de référence : il marque la section « à compléter par l'humain ».

## 6. Hors-périmètre (assumé, écrit noir sur blanc)

- Authentification multi-utilisateurs et gestion des rôles.
- Soumission effective du dossier sur un portail de marchés publics.
- Versionnement documentaire et workflow de validation à plusieurs.
- Design graphique élaboré — une interface sobre et lisible suffit.
- Traitement de CPS bilingues français/arabe (bonus, non requis — les avis fournis sont en français).
- Détection de contradictions internes du CPS, comparaison aux marchés attribués, veille sur nouveaux avis (bonus §7 du cahier des charges — traités seulement si le temps le permet, après le MVP).

## 7. Le découpage — agents et outils

| Agent | Rôle | Modèle |
|---|---|---|
| Extractor | Parse le CPS/DCE (texte + OCR) en exigences structurées, avec n° de page | GPT-4.1 |
| Qualifier | Confronte les exigences au profil entreprise (règles déterministes), score go/no-go | Règles + GPT-4.1 (justification) |
| Writer | Rédige le mémoire technique section par section, cite les références (RAG pgvector) | GPT-4.1 + embedder-small-3 |
| Compliance | Relit le livrable contre la checklist, refuse si pièce manquante | Règles déterministes |
| Orchestrator | Planifie le graphe, relance les agents en échec, escalade à l'humain | GPT-5.5 |

Outils déterministes (jamais confiés au modèle) : calcul de moyenne de CA, comptage de références par secteur/date/attestation, comparaison de seuils numériques, génération du DOCX, stockage du numéro de page à l'extraction.

Mémoire : profil entreprise + références (Postgres), embeddings des références/mémoires passés (pgvector), corrections humaines par section (Postgres, réutilisées par le Writer), résultat OCR par document (cache Redis).
