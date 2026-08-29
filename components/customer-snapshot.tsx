import type { CustomerWithContacts } from "@/lib/types";

export function CustomerSnapshot({ customer }: { customer: CustomerWithContacts | null }) {
  if (!customer) return null;
  const phone = customer.contacts.find((contact) => contact.phone)?.phone ?? "";
  const addressBits = [customer.billing_notes].filter(Boolean);

  return (
    <section className="card mt-4 p-5">
      <h2 className="text-sm font-semibold">{customer.name}</h2>
      {phone ? <p className="mt-1 text-sm text-slate-600">{phone}</p> : null}
      {addressBits.length ? <p className="mt-1 text-sm text-slate-600">{addressBits.join(" · ")}</p> : null}
      {!phone && !addressBits.length ? (
        <p className="mt-1 text-sm text-slate-500">No profile phone on file.</p>
      ) : null}
    </section>
  );
}
