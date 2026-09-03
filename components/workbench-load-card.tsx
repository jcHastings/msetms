import Link from "next/link";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { pathThroughStops } from "@/lib/load-map-shared";
import { buildStopsMapModel, mapsBrowserKey } from "@/lib/load-map";
import type { InboxExceptionGroup } from "@/lib/exceptions";
import { ExceptionIssueLine } from "@/components/exception-issue-line";

export async function WorkbenchLoadCard({ group }: { group: InboxExceptionGroup }) {
  const apiKey = mapsBrowserKey();
  const model = await buildStopsMapModel(group.loadId);
  const path = model.path.length >= 2 ? model.path : pathThroughStops(model.points);

  return (
    <article
      className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"
      data-workbench-card=""
      data-attention-load={group.loadNumber}
    >
      <div className="grid md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <LoadMapCanvas
          apiKey={apiKey}
          points={model.points}
          path={path}
          className="h-56 w-full min-h-[14rem] bg-slate-100 md:h-full"
          missingKeyMessage="Map is off."
          emptyMessage="Lane map not ready."
        />
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/loads/${group.loadId}`} className="font-mono text-sm font-semibold hover:underline">
                {group.loadNumber}
              </Link>
              <div className="mt-0.5 text-xs text-slate-500">
                {group.customerName}
                <span className="mx-1 text-slate-300">·</span>
                {group.origin}
                <span className="mx-1 text-slate-400">→</span>
                {group.destination}
              </div>
            </div>
            <Link href={`/loads/${group.loadId}`} className="text-sm font-medium text-slate-600">
              Open
            </Link>
          </div>
          <ul className="mt-3 space-y-3">
            {group.items.map((item) => (
              <ExceptionIssueLine key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
