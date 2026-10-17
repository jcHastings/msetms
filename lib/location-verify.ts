import { formatDistanceMiles, haversineMiles, type PlaceDetails } from "./places-shared";

export const VERIFY_BATCH_LIMIT = 10;

export type VerifyLocationRow = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
};

export type LocationCompareSide = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
};

export type LocationCompare = {
  current: LocationCompareSide;
  google: LocationCompareSide;
  distanceMiles: number | null;
  distanceLabel: string;
};

export function locationVerifyQuery(location: VerifyLocationRow): string {
  return [location.name, location.street, location.city, location.state, location.zip]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function compareLocationToPlace(current: VerifyLocationRow, place: PlaceDetails): LocationCompare {
  const google = {
    name: place.name.trim(),
    street: place.street.trim(),
    city: place.city.trim(),
    state: place.state.trim(),
    zip: place.zip.trim(),
    lat: place.latitude,
    lng: place.longitude,
  };
  const saved = {
    name: current.name.trim(),
    street: current.street.trim(),
    city: current.city.trim(),
    state: current.state.trim(),
    zip: current.zip.trim(),
    lat: current.latitude,
    lng: current.longitude,
  };
  const distanceMiles = haversineMiles(
    { lat: saved.lat, lng: saved.lng },
    { lat: google.lat, lng: google.lng },
  );
  return {
    current: saved,
    google,
    distanceMiles,
    distanceLabel: formatDistanceMiles(distanceMiles),
  };
}
