import Link from "next/link";
import { redirect } from "next/navigation";
import { answerDriverAssist } from "@/lib/driver-assist";
import { assistCabDocKindLabel, assistCabDocOwnerLabel } from "@/lib/driver-assist-shared";
import { getSignedInDriver } from "@/lib/driver-session";

export const dynamic = "force-dynamic";

export default async function DriverTruckDocsPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const reply = answerDriverAssist(driver, "My truck docs");
  const notes = reply.documents.length
    ? reply.answer
        .split("\n")
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver" className="inline-flex min-h-11 items-center text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Truck documents</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        Registration, insurance, and the IFTA license for your assigned truck.
      </p>

      {reply.documents.length === 0 ? (
        <p
          className="mt-5 rounded-2xl bg-slate-900 px-4 py-4 text-base leading-relaxed text-slate-100 ring-1 ring-white/10"
          role="status"
        >
          {reply.answer}
        </p>
      ) : (
        <ul className="mt-5 space-y-3" aria-label="Truck documents" data-driver-truck-docs="">
          {reply.documents.map((doc) => {
            const kind = assistCabDocKindLabel(doc.kind);
            const owner = doc.unit_label || assistCabDocOwnerLabel(doc.owner_type);
            return (
              <li key={`${doc.owner_type}-${doc.id}`}>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener"
                  aria-label={`${kind}, ${owner}. Open`}
                  className="flex min-h-16 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold text-slate-900">{kind}</span>
                    <span className="block text-sm text-slate-700">{owner}</span>
                    <span className="block break-words text-sm text-slate-600">{doc.original_name}</span>
                  </span>
                  <span className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[#0b4f91] px-4 text-base font-semibold text-white">
                    Open
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {notes.length ? (
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-amber-100">
          {notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
