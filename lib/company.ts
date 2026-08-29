import { getCompanySettings, updateCompanyContact } from "./settings";
import type { CompanyProfile } from "./types";

export function getCompanyProfile(): CompanyProfile {
  const settings = getCompanySettings();
  return {
    company_name: settings.company_name,
    dispatcher_name: settings.dispatcher_name,
    dispatcher_phone: settings.dispatcher_phone,
    dispatcher_fax: settings.dispatcher_fax,
    dispatcher_email: settings.dispatcher_email,
    street: settings.street,
    city: settings.city,
    state: settings.state,
    zip: settings.zip,
  };
}

export function updateCompanyProfile(input: CompanyProfile): void {
  updateCompanyContact(input);
}
