import { LoadEditor } from "@/components/load-editor";

export async function LoadOverlay({
  loadId,
  returnTo,
}: {
  loadId: number;
  returnTo: string;
}) {
  return (
    <div className="load-overlay-backdrop" role="dialog" aria-label="Edit load">
      <div className="load-overlay-panel">
        <LoadEditor loadId={loadId} returnTo={returnTo} variant="overlay" />
      </div>
    </div>
  );
}
