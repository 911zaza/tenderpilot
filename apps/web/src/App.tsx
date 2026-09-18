import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface Exigence {
  id: string;
  article: string | null;
  type: "eliminatoire" | "obligatoire" | "optionnelle";
  texte: string;
  page_source: number | null;
  page_illisible: boolean;
  statut: "satisfaite" | "non_satisfaite" | "a_verifier" | "non_evaluable";
  detail: string;
}

interface Avis {
  id: string;
  verdict: "go" | "no_go" | null;
  justification: string | null;
}

// Interface sobre et lisible — le hors-périmètre design est assumé (spec.md §6)
export function App() {
  const [enCours, setEnCours] = useState(false);
  const [avis, setAvis] = useState<Avis | null>(null);
  const [exigences, setExigences] = useState<Exigence[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  async function deposerAvis(fichier: File) {
    setEnCours(true);
    setErreur(null);
    try {
      const form = new FormData();
      form.append("file", fichier);
      const res = await fetch(`${API_URL}/avis`, { method: "POST", body: form });
      const data = await res.json();
      if (data.escalade) {
        setErreur(data.escalade);
        return;
      }
      setAvis({ id: data.avisId, verdict: data.verdict, justification: data.justification });
      const resExigences = await fetch(`${API_URL}/avis/${data.avisId}/exigences`);
      setExigences(await resExigences.json());
    } catch (e) {
      setErreur(`Erreur de traitement : ${e}`);
    } finally {
      setEnCours(false);
    }
  }

  const blockers = exigences.filter((e) => e.statut === "non_satisfaite");
  const autres = exigences.filter((e) => e.statut !== "non_satisfaite");

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui, sans-serif", padding: "0 16px" }}>
      <h1>TenderPilot</h1>
      <p style={{ color: "#555" }}>Déposez un avis d'appel d'offres en PDF pour obtenir la matrice de conformité et le score go/no-go.</p>

      <input
        type="file"
        accept="application/pdf"
        disabled={enCours}
        onChange={(e) => e.target.files?.[0] && deposerAvis(e.target.files[0])}
      />
      {enCours && <p>Traitement en cours (extraction, qualification)…</p>}
      {erreur && (
        <div style={{ background: "#fdecea", border: "1px solid #f5c2c0", padding: 12, borderRadius: 6, marginTop: 16 }}>
          {erreur}
        </div>
      )}

      {avis && (
        <section style={{ marginTop: 24 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: avis.verdict === "go" ? "#eaf7ea" : "#fdecea",
              border: `1px solid ${avis.verdict === "go" ? "#bfe6bf" : "#f5c2c0"}`,
            }}
          >
            <h2 style={{ margin: 0 }}>{avis.verdict === "go" ? "GO" : "NO-GO"}</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{avis.justification}</p>
          </div>

          <h3 style={{ marginTop: 24 }}>Points bloquants ({blockers.length})</h3>
          <TableauExigences lignes={blockers} />

          <h3 style={{ marginTop: 24 }}>Autres exigences</h3>
          <TableauExigences lignes={autres} />
        </section>
      )}
    </main>
  );
}

function TableauExigences({ lignes }: { lignes: Exigence[] }) {
  if (lignes.length === 0) return <p style={{ color: "#888" }}>Aucune.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
          <th>Type</th>
          <th>Exigence</th>
          <th>Page source</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((e) => (
          <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
            <td>{e.type}</td>
            <td>{e.texte}</td>
            <td>{e.page_illisible ? "illisible" : (e.page_source ?? "—")}</td>
            <td title={e.detail}>{e.statut}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
