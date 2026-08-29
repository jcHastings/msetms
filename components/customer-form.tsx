"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import type { ActionResult, CustomerWithContacts } from "@/lib/types";

type ContactDraft = { name: string; role: string; phone: string; email: string };

type Props = {
  customer?: CustomerWithContacts;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function CustomerForm({ customer, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [contacts, setContacts] = useState<ContactDraft[]>(
    customer?.contacts.length
      ? customer.contacts.map((contact) => ({
          name: contact.name,
          role: contact.role,
          phone: contact.phone,
          email: contact.email,
        }))
      : [{ name: "", role: "", phone: "", email: "" }],
  );

  function updateContact(index: number, field: keyof ContactDraft, value: string) {
    setContacts((current) =>
      current.map((contact, i) => (i === index ? { ...contact, [field]: value } : contact)),
    );
  }

  return (
    <form action={formAction} className="card space-y-6 p-6">
      <FormBanner result={state} />
      <input type="hidden" name="contacts" value={JSON.stringify(contacts)} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field md:col-span-2">
          <label htmlFor="name">Customer name</label>
          <input id="name" name="name" required defaultValue={customer?.name} />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="billing_notes">Billing notes</label>
          <textarea
            id="billing_notes"
            name="billing_notes"
            rows={3}
            defaultValue={customer?.billing_notes}
            placeholder="Terms, invoice email, special billing instructions"
          />
        </div>
        <div className="field">
          <label htmlFor="payment_terms">Payment terms</label>
          <input
            id="payment_terms"
            name="payment_terms"
            defaultValue={customer?.payment_terms}
            placeholder="Net 30"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="credit_hold" value="1" defaultChecked={Boolean(customer?.credit_hold)} />
          Credit hold
        </label>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Contacts</h2>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setContacts((current) => [...current, { name: "", role: "", phone: "", email: "" }])}
          >
            Add contact
          </button>
        </div>
        <div className="space-y-3">
          {contacts.map((contact, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
              <div className="field">
                <label>Name</label>
                <input
                  value={contact.name}
                  onChange={(event) => updateContact(index, "name", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Role</label>
                <input
                  value={contact.role}
                  onChange={(event) => updateContact(index, "role", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  value={contact.phone}
                  onChange={(event) => updateContact(index, "phone", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  value={contact.email}
                  onChange={(event) => updateContact(index, "email", event.target.value)}
                />
              </div>
              {contacts.length > 1 ? (
                <button
                  className="btn btn-ghost justify-self-start"
                  type="button"
                  onClick={() => setContacts((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
