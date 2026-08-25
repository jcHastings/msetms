import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createFromTemplateAction } from "@/lib/dispatcher-actions";
import { listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const templates = listTemplates();
  return (
    <>
      <PageHeader
        title="Load templates"
        subtitle="Save a repeat lane from a load (customer, equipment, reefer, stops). Booking clones the structure — not the old load number or financials."
        actions={
          <Link href="/loads/new" className="btn btn-primary">
            New load
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {templates.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No templates yet. Open a load and use Save as template.</p>
        ) : (
          <table className="table-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Customer</th>
                <th>Picks</th>
                <th>Drops</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="font-semibold">{template.name}</td>
                  <td>{template.customer_name || "—"}</td>
                  <td>{template.pick_count}</td>
                  <td>{template.drop_count}</td>
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
