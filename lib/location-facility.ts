import { getDb } from "./db";
import { parseFacilityInfo, type FacilityInfoInput } from "./location-facility-shared";

export function updateLocationFacilityInfo(id: number, input: FacilityInfoInput): void {
  getDb()
    .prepare(
      `UPDATE locations
       SET receiving_hours = ?, shipping_hours = ?, parking = ?, overnight_parking = ?,
           parking_notes = ?, gate_dock_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.receiving_hours,
      input.shipping_hours,
      input.parking,
      input.overnight_parking,
      input.parking_notes,
      input.gate_dock_notes,
      new Date().toISOString(),
      id,
    );
}

/** Saves the facility block only when the office form carried it (marker field). */
export function saveFacilityInfoFromForm(id: number, formData: FormData): void {
  if (String(formData.get("facility_fields") ?? "") !== "1") return;
  updateLocationFacilityInfo(id, parseFacilityInfo((name) => formData.get(name)));
}
