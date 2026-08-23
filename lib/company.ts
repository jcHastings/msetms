import { getDb } from "./db";
import type { CompanyProfile } from "./types";

const DEFAULTS: CompanyProfile = {
  company_name: "M&S Loads",
  dispatcher_name: "Ana G",
  dispatcher_phone: "402-302-0097",
  dispatcher_fax: "",
  dispatcher_email: "ana@msloads.com",
};

export function getCompanyProfile(): CompanyProfile {
  const row = getDb()
    .prepare(
      `SELECT company_name, dispatcher_name, dispatcher_phone, dispatcher_fax, dispatcher_email
       FROM company_profile WHERE id = 1`,
    )
    .get() as CompanyProfile | undefined;
  return row ?? DEFAULTS;
}

export function updateCompanyProfile(input: CompanyProfile): void {
  getDb()
    .prepare(
      `INSERT INTO company_profile (id, company_name, dispatcher_name, dispatcher_phone, dispatcher_fax, dispatcher_email)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         company_name = excluded.company_name,
         dispatcher_name = excluded.dispatcher_name,
         dispatcher_phone = excluded.dispatcher_phone,
         dispatcher_fax = excluded.dispatcher_fax,
         dispatcher_email = excluded.dispatcher_email`,
    )
    .run(
      input.company_name.trim() || DEFAULTS.company_name,
      input.dispatcher_name.trim() || DEFAULTS.dispatcher_name,
      input.dispatcher_phone.trim(),
      input.dispatcher_fax.trim(),
      input.dispatcher_email.trim(),
    );
}
