import Link from "next/link";
import type { CustomerWithContacts } from "@/lib/types";

export function CustomerSnapshot({ customer }: { customer: CustomerWithContacts | null }) {
  if (!customer) {
    return (
      <section className="card mt-4 p-5 text-sm text-slate-600">
        Pick a customer on this tab, then Save, to see billing terms and contacts here.
      </section>
    );
  }

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{customer.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Terms {customer.payment_terms || "—"}
            {customer.credit_hold ? " · CREDIT HOLD" : ""}
          </p>
          {customer.billing_notes ? <p className="mt-2 text-sm text-slate-600">{customer.billing_notes}</p> : null}
        </div>
        <Link href={`/customers/${customer.id}`} className="btn btn-secondary">
          Open customer
        </Link>
      </div>
      {customer.contacts.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {customer.contacts.map((contact) => (
            <li key={contact.id}>
              <span className="font-medium">{contact.name || "Contact"}</span>
              {contact.role ? <span className="text-slate-500"> · {contact.role}</span> : null}
              {contact.phone ? <span className="text-slate-500"> · {contact.phone}</span> : null}
              {contact.email ? <span className="text-slate-500"> · {contact.email}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No contacts on file.</p>
      )}
    </section>
  );
}
