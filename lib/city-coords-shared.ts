/** Public US city centroids for closest-truck answers. Not truck GPS — never invent vehicle coords. */

export type CityCenter = {
  label: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  aliases: string[];
};

export type MikeGpsPoint = {
  unit: string;
  lat: number | null;
  lng: number | null;
  address?: string | null;
  hasPosition: boolean;
  samsaraVehicleId?: string | null;
  note?: string;
};

export type ClosestCityResult = {
  asked: string;
  found: boolean;
  reason?: "city_not_found" | "no_gps";
  city?: string;
  lat?: number;
  lng?: number;
  ranked: Array<{ unit: string; miles: number; address: string }>;
  skippedNoPing: number;
  skippedNoSamsaraId: number;
};

export const US_CITY_CENTERS: CityCenter[] = [
  { label: "Oklahoma City, OK", city: "Oklahoma City", state: "OK", lat: 35.4676, lng: -97.5164, aliases: ["okc", "oklahoma city"] },
  { label: "Tulsa, OK", city: "Tulsa", state: "OK", lat: 36.154, lng: -95.9928, aliases: ["tulsa"] },
  { label: "Dallas, TX", city: "Dallas", state: "TX", lat: 32.7767, lng: -96.797, aliases: ["dallas"] },
  { label: "Fort Worth, TX", city: "Fort Worth", state: "TX", lat: 32.7555, lng: -97.3308, aliases: ["fort worth", "ft worth"] },
  { label: "Houston, TX", city: "Houston", state: "TX", lat: 29.7604, lng: -95.3698, aliases: ["houston"] },
  { label: "San Antonio, TX", city: "San Antonio", state: "TX", lat: 29.4241, lng: -98.4936, aliases: ["san antonio"] },
  { label: "Austin, TX", city: "Austin", state: "TX", lat: 30.2672, lng: -97.7431, aliases: ["austin"] },
  { label: "Amarillo, TX", city: "Amarillo", state: "TX", lat: 35.222, lng: -101.8313, aliases: ["amarillo"] },
  { label: "Kansas City, MO", city: "Kansas City", state: "MO", lat: 39.0997, lng: -94.5786, aliases: ["kansas city", "kc"] },
  { label: "St. Louis, MO", city: "St. Louis", state: "MO", lat: 38.627, lng: -90.1994, aliases: ["st louis", "saint louis"] },
  { label: "Springfield, MO", city: "Springfield", state: "MO", lat: 37.209, lng: -93.2923, aliases: ["springfield mo"] },
  { label: "Chicago, IL", city: "Chicago", state: "IL", lat: 41.8781, lng: -87.6298, aliases: ["chicago"] },
  { label: "Indianapolis, IN", city: "Indianapolis", state: "IN", lat: 39.7684, lng: -86.1581, aliases: ["indianapolis", "indy"] },
  { label: "Nashville, TN", city: "Nashville", state: "TN", lat: 36.1627, lng: -86.7816, aliases: ["nashville"] },
  { label: "Memphis, TN", city: "Memphis", state: "TN", lat: 35.1495, lng: -90.049, aliases: ["memphis"] },
  { label: "Atlanta, GA", city: "Atlanta", state: "GA", lat: 33.749, lng: -84.388, aliases: ["atlanta"] },
  { label: "Birmingham, AL", city: "Birmingham", state: "AL", lat: 33.5186, lng: -86.8104, aliases: ["birmingham"] },
  { label: "Jackson, MS", city: "Jackson", state: "MS", lat: 32.2988, lng: -90.1848, aliases: ["jackson"] },
  { label: "New Orleans, LA", city: "New Orleans", state: "LA", lat: 29.9511, lng: -90.0715, aliases: ["new orleans"] },
  { label: "Little Rock, AR", city: "Little Rock", state: "AR", lat: 34.7465, lng: -92.2896, aliases: ["little rock"] },
  { label: "Omaha, NE", city: "Omaha", state: "NE", lat: 41.2565, lng: -95.9345, aliases: ["omaha"] },
  { label: "Lincoln, NE", city: "Lincoln", state: "NE", lat: 40.8136, lng: -96.7026, aliases: ["lincoln"] },
  { label: "Denver, CO", city: "Denver", state: "CO", lat: 39.7392, lng: -104.9903, aliases: ["denver"] },
  { label: "Phoenix, AZ", city: "Phoenix", state: "AZ", lat: 33.4484, lng: -112.074, aliases: ["phoenix"] },
  { label: "Los Angeles, CA", city: "Los Angeles", state: "CA", lat: 34.0522, lng: -118.2437, aliases: ["los angeles", "la"] },
  { label: "Minneapolis, MN", city: "Minneapolis", state: "MN", lat: 44.9778, lng: -93.265, aliases: ["minneapolis"] },
  { label: "Des Moines, IA", city: "Des Moines", state: "IA", lat: 41.5868, lng: -93.625, aliases: ["des moines", "des moines iowa"] },
  { label: "Cedar Rapids, IA", city: "Cedar Rapids", state: "IA", lat: 41.9778, lng: -91.6656, aliases: ["cedar rapids"] },
  { label: "Davenport, IA", city: "Davenport", state: "IA", lat: 41.5236, lng: -90.5776, aliases: ["davenport"] },
  { label: "Sioux City, IA", city: "Sioux City", state: "IA", lat: 42.4994, lng: -96.4003, aliases: ["sioux city"] },
  { label: "Dodge City, KS", city: "Dodge City", state: "KS", lat: 37.7528, lng: -100.0171, aliases: ["dodge city"] },
  { label: "Holcomb, KS", city: "Holcomb", state: "KS", lat: 37.9861, lng: -100.9957, aliases: ["holcomb"] },
  { label: "Hastings, NE", city: "Hastings", state: "NE", lat: 40.5861, lng: -98.3884, aliases: ["hastings"] },
];

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
};

export function normalizeCityKey(value: string): string {
  let text = value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\bst\.?\s+/g, "st ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    text = text.replace(new RegExp(`\\b${name}\\b`, "g"), abbr);
  }
  return text.replace(/\s+/g, " ").trim();
}

export function isClosestCityQuestion(question: string): boolean {
  return /(?:closest|nearest)\b.{0,48}\b(?:to|from)\b/i.test(question);
}

export function extractCityFromQuestion(question: string): string {
  const raw = question.trim();
  if (!raw) return "";
  const closest = raw.match(
    /(?:closest|nearest|near)\s+(?:truck\s+|unit\s+)?(?:to|from)\s+(.+?)(?:\?|$)/i,
  );
  if (closest?.[1]) return closest[1].replace(/\b(the|city of)\b/gi, " ").trim();
  return raw;
}

export function findCityCenter(
  asked: string,
  locations: Array<{ name: string; city: string; state: string; lat: number | null; lng: number | null }> = [],
): { label: string; lat: number; lng: number } | null {
  const key = normalizeCityKey(asked);
  if (!key) return null;

  const known = US_CITY_CENTERS.find((city) => {
    const names = [city.label, city.city, `${city.city} ${city.state}`, ...city.aliases].map(normalizeCityKey);
    return names.some((name) => name && (key === name || key.includes(name) || name.includes(key)));
  });
  if (known) return { label: known.label, lat: known.lat, lng: known.lng };

  const saved = locations.find((location) => {
    if (location.lat == null || location.lng == null) return false;
    const city = normalizeCityKey(`${location.city} ${location.state}`);
    const name = normalizeCityKey(location.name);
    return (city && (key === city || key.includes(city) || city.includes(key))) || (name && key.includes(name));
  });
  if (saved && saved.lat != null && saved.lng != null) {
    return { label: `${saved.name}, ${saved.city} ${saved.state}`.trim(), lat: saved.lat, lng: saved.lng };
  }
  return null;
}

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rankTrucksToCoords(
  points: MikeGpsPoint[],
  lat: number,
  lng: number,
  locations: Array<{ name: string; city: string; state: string; lat: number | null; lng: number | null }> = [],
  limit = 8,
): Array<{ unit: string; miles: number; address: string }> {
  return points
    .map((point) => {
      if (point.lat != null && point.lng != null) {
        return {
          unit: point.unit,
          miles: Math.round(haversineMiles(lat, lng, point.lat, point.lng)),
          address: point.address?.trim() || "last GPS",
        };
      }
      const fromCity = findCityCenter(String(point.address ?? ""), locations);
      if (!fromCity) return null;
      return {
        unit: point.unit,
        miles: Math.round(haversineMiles(lat, lng, fromCity.lat, fromCity.lng)),
        address: point.address?.trim() || fromCity.label,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}

export function formatClosestCityReply(result: ClosestCityResult | null, askedFallback = ""): string {
  const asked = (result?.city || result?.asked || askedFallback || "that city").trim();
  if (!result || !result.found) {
    return `I could not place ${asked} on the map, so I cannot rank trucks to it. Fleet GPS is still available — try the city and state again.`;
  }
  if (result.ranked.length === 0) {
    return `I placed ${asked}, but none of the trucks currently have a GPS ping to rank.`;
  }
  const top = result.ranked[0];
  const place = top.address?.trim() ? ` in ${top.address.trim()}` : "";
  return `Truck ${top.unit}${place} is the closest to ${asked}, about ${top.miles} miles away.`;
}

export function closestTrucksToCity(
  question: string,
  points: MikeGpsPoint[],
  locations: Array<{ name: string; city: string; state: string; lat: number | null; lng: number | null }> = [],
): ClosestCityResult | null {
  const asked = extractCityFromQuestion(question);
  if (!/\b(closest|nearest|near)\b/i.test(question) && !findCityCenter(asked, locations)) {
    return null;
  }
  if (!asked) return null;
  const skippedNoPing = points.filter((point) => !point.hasPosition).length;
  const skippedNoSamsaraId = points.filter((point) => !String(point.samsaraVehicleId ?? "").trim()).length;
  const city = findCityCenter(asked, locations);
  if (!city) {
    return { asked, found: false, reason: "city_not_found", ranked: [], skippedNoPing, skippedNoSamsaraId };
  }
  const ranked = rankTrucksToCoords(points, city.lat, city.lng, locations, 8);
  return {
    asked,
    found: true,
    city: city.label,
    lat: city.lat,
    lng: city.lng,
    ranked,
    reason: ranked.length === 0 ? "no_gps" : undefined,
    skippedNoPing,
    skippedNoSamsaraId,
  };
}
