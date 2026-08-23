import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createFromTemplateAction } from "@/lib/dispatcher-actions";
import { formatMoney } from "@/lib/format";
import { listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const templates = listTemplates();
  return (
    <>
      <PageHeader
        title="Load templates"
        subtitle="Save a load as a template from the load page, then book the next one with new dates."
        actions={
          <Link href="/loads/new" className="btn btn-primary">
            New load
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {templates.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No templates yet.</p>
        ) : (
          <table className="table-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Lane</th>
                <th>Commodity</th>
                <th>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="font-semibold">{template.name}</td>
                  <td>
                    {template.origin} → {template.destination}
                  </td>
                  <td>{template.commodity || "—"}</td>
                  <td>{formatMoney(template.rate)}</td>
                  <td className="text-right">
                    <form action={createFromTemplateAction}>
                      <input type="hidden" name="template_id" value={template.id} />
                      <button className="btn btn-secondary" type="submit">
                        Book from template
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
