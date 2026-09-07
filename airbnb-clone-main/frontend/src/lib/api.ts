const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Listing = {
  id: number;
  host_id: number;
  host_name: string;
  host_avatar_url: string;
  host_bio?: string;
  title: string;
  description: string;
  city: string;
  country: string;
  address: string;
  property_type: string;
  price_per_night: number;
  cleaning_fee: number;
  service_fee: number;
  max_guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  rating: number;
  review_count: number;
  latitude: number;
  longitude: number;
  is_superhost: boolean;
  is_favorite: boolean;
  photos: string[];
  amenities: string[];
  booked_ranges?: { check_in: string; check_out: string }[];
  reviews?: Review[];
};

export type Review = {
  id: number;
  rating: number;
  comment: string;
  user_name: string;
  user_avatar_url: string;
  created_at: string;
};

export type ListingsResponse = {
  items: Listing[];
  total: number;
  page: number;
  page_size: number;
  property_types: string[];
  amenities: string[];
};

export type Trip = {
  id: number;
  listing_id: number;
  title: string;
  city: string;
  country: string;
  photo: string;
  check_in: string;
  check_out: string;
  guests: number;
  total_price: number;
  confirmation_code: string;
  status: string;
};

export type HostBooking = Trip & {
  guest_name: string;
};

export type ListingPayload = {
  host_id: number;
  title: string;
  description: string;
  city: string;
  country: string;
  address: string;
  property_type: string;
  price_per_night: number;
  cleaning_fee: number;
  service_fee: number;
  max_guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  latitude: number;
  longitude: number;
  is_superhost: boolean;
  photos: string[];
  amenities: string[];
};

type QueryValue = string | number | undefined | null | string[];

function buildUrl(path: string, query: Record<string, QueryValue> = {}) {
  const url = new URL(path, API_BASE_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => url.searchParams.append(key, item));
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function request<T>(path: string, options: RequestInit = {}, query?: Record<string, QueryValue>) {
  const response = await fetch(buildUrl(path, query), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Something went wrong" }));
    throw new Error(typeof error.detail === "string" ? error.detail : "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  listings: (query: Record<string, QueryValue>) => request<ListingsResponse>("/listings", {}, query),
  listing: (id: number) => request<Listing>(`/listings/${id}`),
  book: (payload: { user_id: number; listing_id: number; check_in: string; check_out: string; guests: number }) =>
    request<{ id: number; confirmation_code: string; nights: number; total_price: number; status: string }>("/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  trips: (userId: number) => request<Trip[]>(`/users/${userId}/trips`),
  hostListings: (hostId: number) => request<Listing[]>(`/hosts/${hostId}/listings`),
  hostBookings: (hostId: number) => request<HostBooking[]>(`/hosts/${hostId}/bookings`),
  createListing: (payload: ListingPayload) =>
    request<Listing>("/listings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateListing: (id: number, payload: ListingPayload) =>
    request<Listing>(`/listings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteListing: (id: number, hostId: number) =>
    request<{ status: string }>(`/listings/${id}`, { method: "DELETE" }, { host_id: hostId }),
  favorite: (userId: number, listingId: number) =>
    request<{ status: string }>(`/users/${userId}/favorites/${listingId}`, { method: "POST" }),
  unfavorite: (userId: number, listingId: number) =>
    request<{ status: string }>(`/users/${userId}/favorites/${listingId}`, { method: "DELETE" }),
};
