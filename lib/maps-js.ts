export type GoogleMapsNamespace = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
  places?: {
    AutocompleteService: new () => {
      getPlacePredictions: (
        request: Record<string, unknown>,
        callback: (results: GooglePlacePrediction[] | null, status: string) => void,
      ) => void;
    };
    PlacesService: new (attr: HTMLElement) => {
      getDetails: (
        request: Record<string, unknown>,
        callback: (result: GooglePlaceResult | null, status: string) => void,
      ) => void;
    };
  };
  importLibrary?: (name: string) => Promise<unknown>;
};

export type GooglePlacePrediction = {
  place_id: string;
  description: string;
};

export type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

export type GooglePlaceResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat: () => number; lng: () => number } | { lat: number; lng: number } };
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
    gm_authFailure?: () => void;
  }
}

let loading: Promise<GoogleMapsNamespace> | null = null;

export function googleMapsJsSrc(apiKey: string): string {
  return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
}

async function ensurePlaces(maps: GoogleMapsNamespace): Promise<GoogleMapsNamespace> {
  if (maps.places?.AutocompleteService) return maps;
  if (typeof maps.importLibrary === "function") {
    try {
      await maps.importLibrary("places");
    } catch {
      // The caller treats a missing Places library as a soft failure.
    }
  }
  return window.google?.maps ?? maps;
}

/** Shared Maps JavaScript loader. The Places library is requested on the same script the map uses. */
export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps load in the browser."));
  const key = apiKey.trim();
  if (!key) return Promise.reject(new Error("Map key is missing."));
  if (window.google?.maps?.places?.AutocompleteService) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  const promise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const finish = () => {
      const maps = window.google?.maps;
      if (!maps) {
        reject(new Error("Maps JavaScript API did not load."));
        return;
      }
      void ensurePlaces(maps)
        .then((ready) => {
          if (!ready.places?.AutocompleteService) {
            reject(new Error("Places library did not load."));
            return;
          }
          resolve(ready);
        })
        .catch(() => reject(new Error("Places library did not load.")));
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-ms-maps='js']");
    if (existing) {
      if (window.google?.maps) {
        finish();
        return;
      }
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () => reject(new Error("Maps JavaScript API did not load.")));
      return;
    }
    const script = document.createElement("script");
    script.dataset.msMaps = "js";
    script.src = googleMapsJsSrc(key);
    script.async = true;
    script.defer = true;
    script.onload = finish;
    script.onerror = () => reject(new Error("Maps JavaScript API did not load."));
    document.head.appendChild(script);
  });
  loading = promise.then(
    (maps) => maps,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}
