-- Schéma initial TenderPilot. Chargé automatiquement au premier démarrage de postgres (docker-entrypoint-initdb.d).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS entreprises (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raison_sociale  TEXT NOT NULL,
  profil          JSONB NOT NULL,          -- profil-entreprise.json complet
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id   UUID NOT NULL REFERENCES entreprises(id),
  nom_fichier     TEXT NOT NULL,
  chemin_fichier  TEXT NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'en_attente', -- en_attente | extraction | qualification | redaction | conformite | termine | echec
  verdict         TEXT,                    -- go | no_go | null tant que non calculé
  justification   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exigences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avis_id         UUID NOT NULL REFERENCES avis(id) ON DELETE CASCADE,
  article         TEXT,
  type            TEXT NOT NULL,           -- eliminatoire | obligatoire | optionnelle
  texte           TEXT NOT NULL,
  page_source     INT,                     -- NULL si page illisible/non trouvée
  page_illisible  BOOLEAN NOT NULL DEFAULT false,
  regle           JSONB,                   -- règle structurée pour le Qualifier, ou NULL si non reconnue
  confiance       NUMERIC(3,2) DEFAULT 1.0,
  statut          TEXT,                    -- satisfaite | non_satisfaite | a_verifier | non_evaluable
  detail          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS references_internes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id               UUID NOT NULL REFERENCES entreprises(id),
  ref_id                      TEXT NOT NULL,     -- REF-01, etc.
  secteur                     TEXT,
  objet                       TEXT,
  montant_ht_mad              NUMERIC,
  annee_debut                 INT,
  duree_mois                  INT,
  attestation_bonne_execution BOOLEAN,
  embedding                   vector(512)        -- embedder-small-3, 512 dimensions
);

CREATE TABLE IF NOT EXISTS sections_memoire (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avis_id         UUID NOT NULL REFERENCES avis(id) ON DELETE CASCADE,
  ordre           INT NOT NULL,
  titre           TEXT NOT NULL,
  contenu         TEXT NOT NULL,
  references_citees TEXT[],
  a_completer     BOOLEAN NOT NULL DEFAULT false,
  statut          TEXT NOT NULL DEFAULT 'brouillon', -- brouillon | valide | corrige
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corrections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avis_id         UUID NOT NULL REFERENCES avis(id) ON DELETE CASCADE,
  section_id      UUID NOT NULL REFERENCES sections_memoire(id) ON DELETE CASCADE,
  contenu_corrige TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Le checkpointer LangGraph Postgres crée ses propres tables au premier lancement (préfixe langgraph_).
