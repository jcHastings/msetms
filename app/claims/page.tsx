import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listClaims } from "@/lib/desk";

export const dynamic = "force-dynamic";

export default function ClaimsPage() {
  const claims = listClaims();
  return (
    <>
      <PageHeader
        title="Claims / OS&D"
        subtitle="Claims on a load."
      />
      <div className="card overflow-hidden">
        {claims.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No claims yet. Open one from a load page.</p>
        ) : (
          <table className="table-grid">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Load</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="font-semibold">{claim.claim_number}</td>
                  <td>
                    <Link href={`/loads/${claim.load_id}`} className="font-mono underline">
                      {claim.load_number ?? claim.load_id}
                    </Link>
                  </td>
                  <td>{claim.kind}</td>
                  <td>{claim.status}</td>
                  <td className="text-slate-600">{claim.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
