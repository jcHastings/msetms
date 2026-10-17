/** Client-safe: OO loads sit under the company, not the driver's personal name. */

import { isOwnerOperator } from "./types";

export function assignedLoadName(input: {
  name?: string | null;
  driver_name?: string | null;
  driver_type?: string | null;
  company_name?: string | null;
  driver_company_name?: string | null;
}): string {
  const person = String(input.driver_name ?? input.name ?? "").trim();
  if (!isOwnerOperator(input.driver_type)) return person;
  return String(input.driver_company_name ?? input.company_name ?? "").trim() || person;
}
