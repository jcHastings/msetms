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
  const { handleAssign, blurPersist } = useLoadAssignPersist(load?.id);
  const [customerId, setCustomerId] = useState(
    load?.customer_id
      ? String(load.customer_id)
      : defaults.customer_id
        ? String(defaults.customer_id)
        : "",
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [createName, setCreateName] = useState(load?.customer_id ? "" : (defaults.customer_name ?? ""));
  const selectedCustomer = customers.find((item) => String(item.id) === customerId) ?? null;
  const customerMatches = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerQuery.trim().toLowerCase()),
  );
  const customerField = customerQuery || selectedCustomer?.name || "";
  const showMatches = Boolean(customerQuery.trim());

  return (
    <section data-load-tab="customer" className={card ? "card overflow-hidden" : undefined}>
      {card ? (
        <div className="section-head px-6 py-3">
          <h2 className="text-sm font-semibold">Customer</h2>
        </div>
      ) : null}
      <div className={card ? "grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
      <input type="hidden" name="customer_name" value={customerId ? "" : createName} />
      <input type="hidden" id="customer_id" name="customer_id" value={customerId} required={!createName} />
      <div className="field md:col-span-2" data-customer-picker="" data-critical-save="">
        <label htmlFor="customer_search">Customer</label>
        <input
          id="customer_search"
          value={customerField}
          onChange={(event) => {
            const next = event.target.value;
            setCustomerQuery(next);
            if (!next) {
              setCustomerId("");
            } else if (selectedCustomer && next !== selectedCustomer.name) {
              setCustomerId("");
            }
          }}
          placeholder="Search existing customers"
          autoComplete="off"
        />
        {showMatches ? (
          <ul className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white" role="listbox">
            {customerMatches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No match</li>
            ) : (
              customerMatches.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      const next = String(customer.id);
                      setCustomerId(next);
                      setCustomerQuery("");
                      setCreateName("");
                      if (load) handleAssign(load.customer_id, next, "customer_id");
                    }}
                  >
                    {customer.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {selectedCustomer ? (
        <div className="md:col-span-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setCustomerId("");
              setCreateName("");
              setCustomerQuery("");
              if (load) handleAssign(load.customer_id, "", "customer_id");
            }}
          >
            Remove customer
          </button>
        </div>
      ) : (
        <div className="field md:col-span-2">
          <label htmlFor="new_customer_name">Or create customer</label>
          <input
            id="new_customer_name"
            value={createName}
            onChange={(event) => {
              setCreateName(event.target.value);
              if (event.target.value) {
                setCustomerId("");
                setCustomerQuery("");
              }
            }}
            placeholder="New customer name"
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="contact_name">Contact name</label>
        <input
          id="contact_name"
          name="contact_name"
          data-autosave=""
          defaultValue={load?.contact_name ?? ""}
          onBlur={blurPersist("contact_name", load?.contact_name ?? "")}
        />
      </div>
      <div className="field">
        <label htmlFor="contact_email">Contact email</label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          data-autosave=""
          defaultValue={load?.contact_email ?? ""}
          onBlur={blurPersist("contact_email", load?.contact_email ?? "")}
        />
      </div>
      <div className="field">
        <label htmlFor="contact_phone">Contact phone</label>
        <input
          id="contact_phone"
          name="contact_phone"
          data-autosave=""
          defaultValue={load?.contact_phone ?? ""}
          onBlur={blurPersist("contact_phone", load?.contact_phone ?? "")}
        />
      </div>
      <div className="field">
        <label htmlFor="contact_ext">Ext</label>
        <input
          id="contact_ext"
          name="contact_ext"
          data-autosave=""
          defaultValue={load?.contact_ext ?? ""}
          onBlur={blurPersist("contact_ext", load?.contact_ext ?? "")}
        />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="customer_reference">Customer reference #</label>
        <input
          id="customer_reference"
          name="customer_reference"
          defaultValue={load?.customer_reference || defaults.customer_reference || ""}
        />
      </div>
      </div>
    </section>
  );
}
