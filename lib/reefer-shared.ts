export const REEFER_MODES = [
  { value: "continuous", label: "Continuous" },
  { value: "start_stop", label: "Start/Stop" },
] as const;

export type ReeferMode = (typeof REEFER_MODES)[number]["value"];

export function isReeferMode(value: string | null | undefined): value is ReeferMode {
  return value === "continuous" || value === "start_stop";
}

export function labelForReeferMode(mode: ReeferMode | null | undefined): string {
  if (mode === "start_stop") return "Start/Stop";
  if (mode === "continuous") return "Continuous";
  return "";
}

export function parseReeferModeFromText(text: string): ReeferMode | null {
  if (!text.trim()) return null;
  if (/never\s+start(?:\s+and)?\s*[/\-\s]*stop/i.test(text)) return "continuous";
  if (/\bcontinuous\b/i.test(text)) return "continuous";
  if (/start(?:\s+and)?\s*[/\-\s]*stop/i.test(text) || /start[\s\-/]*stop/i.test(text) || /cycle\s*sentry/i.test(text)) {
    return "start_stop";
  }
  return null;
}

export function parseReeferSetpointFromText(text: string): number | null {
  if (!text.trim()) return null;
  const labeled = text.match(
    /(?:reefer\s*)?(?:setpoint|set point|temp(?:erature)?|maintain|run(?:ning)? at)\s*[:#]?\s*(-?\d+(?:\.\d+)?)\s*°?\s*F\b/i,
  );
  if (labeled) return Number.parseFloat(labeled[1]);
  const spoken = text.match(
    /(?:pre[-\s]*cool(?:ed)?|temperature|temp|setpoint|run(?:ning)?(?:\s+at)?)\s*(?:to|at|:)?\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*F|degrees(?:\s*F)?|\bF\b)/i,
  );
  if (spoken) return Number.parseFloat(spoken[1]);
  const set = text.match(/\breefer\s+set\s+(-?\d+(?:\.\d+)?)\s*°?\s*F\b/i);
  if (set) return Number.parseFloat(set[1]);
  const bare = text.match(/(-?\d+(?:\.\d+)?)\s*°\s*F\b/);
  return bare ? Number.parseFloat(bare[1]) : null;
}

export type ReeferSpecInput = {
  reefer_setpoint_f?: number | null;
  temperature_f?: number | null;
  reefer_mode?: string | null;
  special_instructions?: string | null;
  equipment?: string | null;
  truck_type?: string | null;
  trailer_type?: string | null;
};

export type ReeferSpec = {
  isReefer: boolean;
  setpointF: number | null;
  mode: ReeferMode | null;
};

export function resolveReeferSpec(load: ReeferSpecInput): ReeferSpec {
  const notes = load.special_instructions ?? "";
  const storedSetpoint = load.reefer_setpoint_f ?? parseReeferSetpointFromText(notes);
  const storedMode = isReeferMode(load.reefer_mode) ? load.reefer_mode : null;
  const parsedMode = parseReeferModeFromText(notes);
  const looksReefer = Boolean(
    storedSetpoint != null ||
      storedMode ||
      parsedMode ||
      /reefer/i.test(load.equipment ?? "") ||
      load.truck_type === "reefer" ||
      load.trailer_type === "reefer",
  );
  if (!looksReefer) return { isReefer: false, setpointF: null, mode: null };
  return {
    isReefer: true,
    setpointF: storedSetpoint ?? load.temperature_f ?? null,
    mode: storedMode ?? parsedMode ?? "continuous",
  };
}

export function formatReeferSetpoint(setpointF: number | null | undefined): string {
  return setpointF == null || Number.isNaN(setpointF) ? "" : `${setpointF}°F`;
}

export function formatReeferHeader(spec: ReeferSpec): string {
  if (!spec.isReefer) return "";
  const parts = ["Reefer"];
  const setpoint = formatReeferSetpoint(spec.setpointF);
  if (setpoint) parts.push(setpoint);
  if (spec.mode) parts.push(labelForReeferMode(spec.mode));
  return parts.join(" · ");
}

export function persistReeferMode(input: {
  reefer_mode?: string | null;
  reefer_setpoint_f?: number | null;
  special_instructions?: string | null;
}): string {
  if (isReeferMode(input.reefer_mode)) return input.reefer_mode;
  if (input.reefer_setpoint_f != null) {
    return parseReeferModeFromText(input.special_instructions ?? "") ?? "continuous";
  }
  return parseReeferModeFromText(input.special_instructions ?? "") ?? "";
}
