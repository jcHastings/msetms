"use client";

import { useState } from "react";
import type { LoadFormDefaults } from "@/components/load-basics-screen";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import type { Customer, Load } from "@/lib/types";

export function LoadCustomerScreen({
  customers,
  load,
  defaults = {},
  card = true,
}: {
  customers: Customer[];
  load?: Load;
  defaults?: LoadFormDefaults;
  card?: boolean;
}) {
  const { handleAssign } = useLoadAssignPersist(load?.id);
  const [customerId, setCustomerId] = useState(
    load?.customer_id
      ? String(load.customer_id)
      : defaults.customer_id
        ? String(defaults.customer_id)
        : "",
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [createName, setCreateName] = useState(defaults.customer_name ?? "");
  const selectedCustomer = customers.find((item) => String(item.id) === customerId) ?? null;
  const customerMatches = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerQuery.trim().toLowerCase()),
  );

  return (
    <section data-load-tab="customer" className={card ? "card overflow-hidden" : undefined}>
      {card ? (
        <div className="section-head px-6 py-3">
          <h2 className="text-sm font-semibold">Customer</h2>
        </div>
      ) : null}
      <div className={card ? "grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
      <input type="hidden" name="customer_name" value={customerId ? "" : createName} />
      <div className="field md:col-span-2">
        <label htmlFor="customer_search">Customer</label>
        <input
          id="customer_search"
          value={customerQuery}
          onChange={(event) => setCustomerQuery(event.target.value)}
          placeholder="Search existing customers"
        />
        <select
          id="customer_id"
          name="customer_id"
          required={!createName}
          value={customerId}
          data-first-assign={load?.customer_id ? undefined : ""}
          onChange={(event) => {
            const next = event.target.value;
            setCustomerId(next);
            if (next) setCreateName("");
            if (load) handleAssign(load.customer_id, next, "customer_id", event);
          }}
        >
          <option value="">{createName ? `Create “${createName}”` : "Select customer"}</option>
          {(customerQuery.trim() ? customerMatches : customers).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="new_customer_name">Or create customer</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="new_customer_name"
            value={createName}
            onChange={(event) => {
              setCreateName(event.target.value);
              if (event.target.value) setCustomerId("");
            }}
            placeholder="New customer name"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setCustomerId("");
              setCreateName("");
              setCustomerQuery("");
            }}
          >
            Remove customer
          </button>
        </div>
      </div>
      {selectedCustomer ? (
        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium">{selectedCustomer.name}</div>
          <p className="text-slate-600">Profile phone and address live on the customer record. Load contact below is for this load only.</p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="contact_name">Contact name</label>
        <input id="contact_name" name="contact_name" defaultValue={load?.contact_name ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="contact_email">Contact email</label>
        <input id="contact_email" name="contact_email" type="email" defaultValue={load?.contact_email ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="contact_phone">Contact phone</label>
        <input id="contact_phone" name="contact_phone" defaultValue={load?.contact_phone ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="contact_ext">Ext</label>
        <input id="contact_ext" name="contact_ext" defaultValue={load?.contact_ext ?? ""} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="customer_reference">Customer reference #</label>
        <input
          id="customer_reference"
          name="customer_reference"
          defaultValue={load?.customer_reference || load?.po_number || defaults.po_number || ""}
        />
      </div>
      </div>
    </section>
  );
}
