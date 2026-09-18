// Charge profil-entreprise.json en base + indexe les références dans pgvector.
// Usage : npm run seed -- ./chemin/vers/profil-entreprise.json
import { readFile } from "node:fs/promises";
import { query } from "./client.js";
import { embedText } from "../llm/client.js";

async function main() {
  const chemin = process.argv[2] ?? "./data/profil-entreprise.json";
  const profil = JSON.parse(await readFile(chemin, "utf-8"));

  const [entreprise] = await query<{ id: string }>(
    `INSERT INTO entreprises (raison_sociale, profil) VALUES ($1, $2) RETURNING id`,
    [profil.raison_sociale, profil],
  );
  console.log(`Entreprise créée : ${entreprise.id}`);

  for (const ref of profil.references) {
    const embedding = await embedText(`${ref.objet} (${ref.secteur})`);
    const vecteur = `[${embedding.join(",")}]`;
    await query(
      `INSERT INTO references_internes (entreprise_id, ref_id, secteur, objet, montant_ht_mad, annee_debut, duree_mois, attestation_bonne_execution, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entreprise.id, ref.id, ref.secteur, ref.objet, ref.montant_ht_mad, ref.annee_debut, ref.duree_mois, ref.attestation_bonne_execution, vecteur],
    );
  }
  console.log(`${profil.references.length} références indexées.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
