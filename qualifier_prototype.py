"""
Prototype de l'agent Qualifier pour TenderPilot.
Objectif : valider la LOGIQUE de qualification (pas le pipeline final en TS/LangGraph)
sur un cas réel (AO-2026-001) avant de la coder dans l'agent définitif.

Principe retenu :
- Chaque exigence extraite porte : id, article, type, texte, page_source, verifiable_from_profil (bool)
- Trois familles de "type" pour le scoring go/no-go :
    ELIMINATOIRE      -> non respectée = no-go immédiat, quel que soit le reste
    OBLIGATOIRE_STRUCT -> capacité de fond (références, effectif, certif, équipe) :
                          non respectée = blocker fort, généralement non réparable avant la deadline
    OBLIGATOIRE_ADMIN  -> pièce administrative renouvelable (attestation fiscale/CNSS/RC/assurance) :
                          non respectée aujourd'hui = action à faire avant dépôt, PAS un no-go en soi
    OPTIONNELLE        -> bonus, n'entre pas dans le score go/no-go
- Un score numérique n'est calculé qu'à titre indicatif ; la sortie qui compte est la LISTE DES BLOCKERS
  triée (éliminatoire d'abord), comme demandé par le cahier des charges (§EX-04 : "points bloquants en premier").
"""

import json
from datetime import date

PROFIL = json.load(open("/tmp/claude-0/-home-claude/1fa99423-ec91-5b89-a00c-c3a9478e15f8/scratchpad/sujet01/sujet01/sujet-01-tenderpilot/profil-entreprise.json"))

# --- Exigences extraites manuellement de AO-2026-001 (simule la sortie de l'agent Extractor) ---
EXIGENCES = [
    {"id": "3.1", "article": "RC Art.3", "type": "ELIMINATOIRE", "page": 2,
     "texte": "CA annuel moyen HT > 12 778 000 MAD sur les 3 derniers exercices clos"},
    {"id": "3.2", "article": "RC Art.3", "type": "OBLIGATOIRE_ADMIN", "page": 2,
     "texte": "Attestation fiscale de moins de 3 mois"},
    {"id": "3.3", "article": "RC Art.3", "type": "OBLIGATOIRE_ADMIN", "page": 2,
     "texte": "Attestation CNSS en cours de validité"},
    {"id": "3.4", "article": "RC Art.3", "type": "ELIMINATOIRE", "page": 2,
     "texte": "Certification ISO 9001:2015 en cours de validité"},
    {"id": "3.5", "article": "RC Art.3", "type": "OBLIGATOIRE_ADMIN", "page": 2,
     "texte": "Déclaration sur l'honneur (non-liquidation judiciaire)"},
    {"id": "4.6", "article": "RC Art.4", "type": "OBLIGATOIRE_STRUCT", "page": 2,
     "texte": "Au moins 4 références similaires secteur éducation, 5 dernières années, attestées bonne exécution"},
    {"id": "4.7", "article": "RC Art.4", "type": "OBLIGATOIRE_STRUCT", "page": 2,
     "texte": "Effectif permanent >= 60 personnes"},
    {"id": "4.8", "article": "RC Art.4", "type": "OBLIGATOIRE_ADMIN", "page": 2,
     "texte": "Liste des moyens matériels et logiciels affectés au marché"},
    {"id": "art6-seuil", "article": "RC Art.6", "type": "ELIMINATOIRE", "page": 3,
     "texte": "Note technique >= 60/85 sur la partie technique (sinon élimination) — EXIGENCE NON NUMÉROTÉE, "
              "en fin d'article, facile à manquer : c'est le cas 'éliminatoire cachée' du cahier des charges."},
    {"id": "7.10", "article": "CPS Art.7", "type": "OBLIGATOIRE_STRUCT", "page": 5,
     "texte": "Chef de projet >= 8 ans d'expérience en conduite de projets comparables"},
    {"id": "equipe-min", "article": "CPS Art.7", "type": "OBLIGATOIRE_STRUCT", "page": 4,
     "texte": "Equipe min: 1 Chef de projet, 1 Architecte technique, 2 Ingénieurs dév (>=5 ans), 1 Ingénieur qualité (>=5 ans)"},
    {"id": "17.12", "article": "CPS Art.17", "type": "OPTIONNELLE", "page": 6,
     "texte": "Variantes techniques argumentées (bonus)"},
    {"id": "17.13", "article": "CPS Art.17", "type": "OPTIONNELLE", "page": 6,
     "texte": "Démarche éco-conception valorisée (bonus)"},
]

SEANCE_PUBLIQUE = date(2026, 3, 12)  # date de dépôt / référence pour la validité des pièces


def check_ca():
    ca = PROFIL["chiffre_affaires_ht_mad"]
    moyenne = sum(ca.values()) / len(ca)
    seuil = 12_778_000
    return moyenne > seuil, f"moyenne 3 ans = {moyenne:,.0f} MAD (seuil {seuil:,.0f})"


def check_certif(nom):
    ok = nom in PROFIL["certifications"]
    return ok, f"certification '{nom}' {'présente' if ok else 'ABSENTE du profil'}"


def check_admin_piece(nom):
    ok = nom in PROFIL["attestations_disponibles"]
    return ok, f"pièce '{nom}' {'disponible (à re-délivrer/dater avant dépôt)' if ok else 'ABSENTE du profil'}"


def check_references(secteur, min_count, min_annee):
    refs = [r for r in PROFIL["references"]
            if r["secteur"] == secteur
            and r["annee_debut"] >= min_annee
            and r["attestation_bonne_execution"]]
    ok = len(refs) >= min_count
    return ok, f"{len(refs)} référence(s) valides secteur '{secteur}' (>= {min_annee}, attestées) sur {min_count} requises — " \
               f"ids: {[r['id'] for r in refs]}"


def check_effectif(seuil):
    eff = PROFIL["effectif"]
    return eff >= seuil, f"effectif = {eff} (seuil {seuil})"


def check_chef_projet(min_annees):
    candidats = [c for c in PROFIL["equipe"] if c["poste"] == "Chef de projet" and c["annees_experience"] >= min_annees]
    return len(candidats) > 0, f"{len(candidats)} chef(s) de projet >= {min_annees} ans dispo — {[c['id'] for c in candidats]}"


def check_equipe_min():
    besoins = {
        "Chef de projet": (1, 8),
        "Architecte technique": (1, 7),
        "Ingénieur de développement": (2, 5),
        "Ingénieur qualité": (1, 5),
    }
    details = []
    ok_global = True
    for poste, (n, annees) in besoins.items():
        dispo = [c for c in PROFIL["equipe"] if c["poste"] == poste and c["annees_experience"] >= annees]
        ok = len(dispo) >= n
        ok_global &= ok
        details.append(f"{poste}: {len(dispo)}/{n} dispo (>= {annees} ans)")
    return ok_global, "; ".join(details)


RESULTS = []

def add(exigence, ok, detail):
    RESULTS.append({**exigence, "satisfaite": ok, "detail": detail})


for ex in EXIGENCES:
    if ex["id"] == "3.1":
        add(ex, *check_ca())
    elif ex["id"] == "3.2":
        add(ex, *check_admin_piece("Attestation fiscale"))
    elif ex["id"] == "3.3":
        add(ex, *check_admin_piece("Attestation CNSS"))
    elif ex["id"] == "3.4":
        add(ex, *check_certif("ISO 9001:2015"))
    elif ex["id"] == "3.5":
        add(ex, *check_admin_piece("Déclaration sur l'honneur"))
    elif ex["id"] == "4.6":
        add(ex, *check_references("éducation", 4, 2021))
    elif ex["id"] == "4.7":
        add(ex, *check_effectif(60))
    elif ex["id"] == "4.8":
        add(ex, True, "producible sur simple déclaration (pas de donnée profil dédiée)")
    elif ex["id"] == "art6-seuil":
        add(ex, None, "NON ÉVALUABLE À CE STADE : dépend de la qualité du mémoire technique rédigé par l'agent Writer. "
                       "Doit être remontée comme RISQUE (garde-fou qualité), pas comme blocker/non-blocker figé.")
    elif ex["id"] == "7.10":
        add(ex, *check_chef_projet(8))
    elif ex["id"] == "equipe-min":
        add(ex, *check_equipe_min())
    elif ex["id"] in ("17.12", "17.13"):
        add(ex, None, "optionnelle : n'entre pas dans le go/no-go, valorisée si traitée dans le mémoire")

# --- Score go/no-go ---
blockers_eliminatoires = [r for r in RESULTS if r["type"] == "ELIMINATOIRE" and r["satisfaite"] is False]
blockers_structurels = [r for r in RESULTS if r["type"] == "OBLIGATOIRE_STRUCT" and r["satisfaite"] is False]
actions_admin = [r for r in RESULTS if r["type"] == "OBLIGATOIRE_ADMIN" and r["satisfaite"] is False]
risques = [r for r in RESULTS if r["satisfaite"] is None and r["type"] != "OPTIONNELLE"]

if blockers_eliminatoires:
    verdict = "NO-GO"
elif blockers_structurels:
    verdict = "NO-GO"
else:
    verdict = "GO"

print("="*80)
print(f"DOSSIER AO-2026-001 — Ministère de l'Éducation Nationale — maintenance applicative")
print(f"VERDICT : {verdict}")
print("="*80)

for r in RESULTS:
    status = "✓" if r["satisfaite"] is True else ("✗" if r["satisfaite"] is False else "?")
    print(f"[{status}] {r['id']:12} ({r['type']:20}) p.{r['page']} — {r['texte']}")
    print(f"      -> {r['detail']}")

print("\n--- BLOCKERS (points bloquants, éliminatoires d'abord) ---")
for r in blockers_eliminatoires + blockers_structurels:
    print(f"  * [{r['type']}] {r['id']} (p.{r['page']}): {r['detail']}")

print("\n--- ACTIONS ADMINISTRATIVES avant dépôt (non bloquantes si traitées à temps) ---")
for r in actions_admin:
    print(f"  * {r['id']} (p.{r['page']}): {r['detail']}")

print("\n--- RISQUES à signaler à l'humain (non calculables depuis le profil) ---")
for r in risques:
    print(f"  * {r['id']} (p.{r['page']}): {r['detail']}")
