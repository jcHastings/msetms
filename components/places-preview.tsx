"use client";

import { useState } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { US_STATES } from "@/lib/locations";
import { applyNyBoroughState, relayPointLabel, type PlaceDetails } from "@/lib/places-shared";

const MOCKED: Array<{ placeId: string; label: string; place: PlaceDetails }> = [
  {
    placeId: "mock-tyson",
    label: "Tyson Foods, 2200 Don Tyson Pkwy, Springdale, AR",
    place: {
      placeId: "mock-tyson",
      name: "Tyson Foods",
      street: "2200 Don Tyson Parkway",
      city: "Springdale",
      state: "AR",
      zip: "72764",
      country: "US",
      formatted: "2200 Don Tyson Pkwy, Springdale, AR 72764, USA",
      latitude: 36.186,
      longitude: -94.128,
    },
  },
  {
    placeId: "mock-pilot",
    label: "Pilot Travel Center, Oklahoma City, OK",
    place: {
      placeId: "mock-pilot",
      name: "Pilot Travel Center",
      street: "9100 S I-35 Service Rd",
      city: "Oklahoma City",
      state: "OK",
      zip: "73149",
      country: "US",
      formatted: "9100 S I-35 Service Rd, Oklahoma City, OK 73149, USA",
      latitude: 35.51,
      longitude: -97.61,
    },
  },
];

/** Screenshot harness. Not linked from the desk. Mocked suggestions are labeled in the menu. */
export function PlacesPreview() {
  const [handoff, setHandoff] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-mocked-places="">
        Mocked Google suggestions. This page does not call Google.
      </p>
      <form
        className="card space-y-3 p-5"
        data-add-relay-preview=""
        onSubmit={(event) => event.preventDefault()}
      >
        <h1 className="text-sm font-semibold">Add Relay</h1>
        <div className="field">
          <label htmlFor="relay-handoff">Relay point</label>
          <PlacesAutocomplete
            id="relay-handoff"
            name="handoff"
            apiKey=""
            required
            value={handoff}
            placeholder="Handoff city or business"
            previewSuggestions={MOCKED}
            onChange={setHandoff}
            onPlace={(place) => {
              setHandoff(relayPointLabel(place));
              setPlaceId(place.placeId);
              setLat(place.latitude != null ? String(place.latitude) : "");
              setLng(place.longitude != null ? String(place.longitude) : "");
            }}
          />
          <p className="mt-1 text-xs text-slate-500">
            {placeId ? `Saved pin ${lat}, ${lng}` : "Type Ty or Pi to open the mocked list."}
          </p>
        </div>
      </form>
      <form
        className="card space-y-3 p-5"
        data-add-location-preview=""
        onSubmit={(event) => event.preventDefault()}
      >
        <h1 className="text-sm font-semibold">New location</h1>
        <div className="field">
          <label htmlFor="name">Name</label>
          <PlacesAutocomplete
            id="name"
            name="name"
            apiKey=""
            required
            value={name}
            placeholder="Type a business, like Tyson Foods"
            previewSuggestions={MOCKED}
            onChange={setName}
            onPlace={(place, query) => {
              const business = place.name.trim();
              if (!name.trim() || name.trim().toLowerCase() === query.trim().toLowerCase()) setName(business || name);
              if (place.street) setStreet(place.street);
              if (place.city) setCity(place.city);
              if (place.city || place.state) setRegion(applyNyBoroughState(place.city || city, place.state || region));
              if (place.zip) setZip(place.zip);
              if (place.country) setCountry(place.country);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="street">Street</label>
          <input id="street" value={street} onChange={(event) => setStreet(event.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="state">State</label>
            <select id="state" value={region} onChange={(event) => setRegion(event.target.value)}>
              <option value="">Select state</option>
              {US_STATES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="zip">ZIP</label>
          <input id="zip" value={zip} onChange={(event) => setZip(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" value={country} onChange={(event) => setCountry(event.target.value)} />
        </div>
      </form>
    </div>
  );
}
