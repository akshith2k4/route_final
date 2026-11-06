import { getGoogleAccessToken } from "./google-auth";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string | null;
};

type GeocodeV4Response = {
  results?: {
    formattedAddress?: string;
    placeId?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GeocodeV3Response = {
  status: string;
  error_message?: string;
  results?: {
    formatted_address?: string;
    place_id?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }[];
};

function googleErrorMessage(error: {
  message?: string;
  status?: string;
}): string {
  const message = error.message ?? "";
  if (
    message.includes("has not been used") ||
    message.includes("it is disabled") ||
    message.includes("SERVICE_DISABLED")
  ) {
    return "The Google Geocoding API is not enabled in the Google Cloud project. Enable it and try again.";
  }
  return message || "Google could not look up that address.";
}

async function geocodeWithOAuth(
  address: string,
): Promise<GeocodeResult> {
  const { token } = await getGoogleAccessToken(
    "https://www.googleapis.com/auth/maps-platform.geocode.address",
  );
  const url = new URL(
    `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(address)}`,
  );
  url.searchParams.set("regionCode", "IN");
  url.searchParams.set("languageCode", "en");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | GeocodeV4Response
    | null;

  if (!response.ok) {
    throw new Error(googleErrorMessage(data?.error ?? {}));
  }

  const result = data?.results?.[0];
  const latitude = result?.location?.latitude;
  const longitude = result?.location?.longitude;

  if (!result || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(
      "Google could not find that address. Try a more complete address.",
    );
  }

  return {
    latitude: latitude as number,
    longitude: longitude as number,
    formattedAddress: result.formattedAddress ?? address,
    placeId: result.placeId ?? null,
  };
}

async function geocodeWithApiKey(
  address: string,
  apiKey: string,
): Promise<GeocodeResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  url.searchParams.set("region", "in");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Google geocoding request failed (${response.status}).`);
  }

  const data = (await response.json()) as GeocodeV3Response;
  const result = data.results?.[0];
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;

  if (
    data.status !== "OK" ||
    !result ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    if (data.status === "ZERO_RESULTS") {
      throw new Error(
        "Google could not find that address. Try a more complete address.",
      );
    }
    throw new Error(
      data.error_message ??
        `Google geocoding failed${data.status ? ` (${data.status})` : ""}.`,
    );
  }

  return {
    latitude: latitude as number,
    longitude: longitude as number,
    formattedAddress: result.formatted_address ?? address,
    placeId: result.place_id ?? null,
  };
}

export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    return geocodeWithApiKey(address, apiKey);
  }

  return geocodeWithOAuth(address);
}
