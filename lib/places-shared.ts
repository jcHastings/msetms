export type PlaceSuggestion = {
  placeId: string;
  label: string;
};

export type PlaceDetails = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  formatted: string;
  latitude: number | null;
  longitude: number | null;
};
