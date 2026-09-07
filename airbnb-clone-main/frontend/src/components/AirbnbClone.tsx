"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, HostBooking, Listing, ListingPayload, ListingsResponse, Trip } from "@/lib/api";

const GUEST_USER_ID = 1;
const HOST_USER_ID = 2;
const today = new Date().toISOString().slice(0, 10);

const defaultListingForm: ListingPayload = {
  host_id: HOST_USER_ID,
  title: "",
  description: "",
  city: "",
  country: "",
  address: "",
  property_type: "Apartment",
  price_per_night: 180,
  cleaning_fee: 45,
  service_fee: 36,
  max_guests: 2,
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  latitude: 40.7128,
  longitude: -74.006,
  is_superhost: false,
  photos: ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80"],
  amenities: ["Wifi", "Kitchen", "Self check-in"],
};

type View = "explore" | "trips" | "host";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function nightsBetween(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 0;
  const nights = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000;
  return nights > 0 ? nights : 0;
}

function overlapsBookedDates(listing: Listing | null, checkIn: string, checkOut: string) {
  if (!listing?.booked_ranges || !checkIn || !checkOut) return false;
  return listing.booked_ranges.some((range) => checkIn < range.check_out && checkOut > range.check_in);
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ListingImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 768px) 100vw, 33vw"
      className={`object-cover ${className ?? ""}`}
      priority={false}
    />
  );
}

export default function AirbnbClone() {
  const [view, setView] = useState<View>("explore");
  const [listingsData, setListingsData] = useState<ListingsResponse | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    location: "",
    checkIn: today,
    checkOut: "",
    guests: 2,
    propertyType: "Any",
    minPrice: "",
    maxPrice: "",
    amenities: [] as string[],
  });
  const [booking, setBooking] = useState({ checkIn: today, checkOut: "", guests: 2 });
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hostListings, setHostListings] = useState<Listing[]>([]);
  const [hostBookings, setHostBookings] = useState<HostBooking[]>([]);
  const [editingListingId, setEditingListingId] = useState<number | null>(null);
  const [form, setForm] = useState<ListingPayload>(defaultListingForm);

  const query = useMemo(
    () => ({
      location: filters.location,
      guests: filters.guests,
      property_type: filters.propertyType === "Any" ? "" : filters.propertyType,
      min_price: filters.minPrice,
      max_price: filters.maxPrice,
      amenity: filters.amenities,
      page,
      page_size: 6,
      user_id: GUEST_USER_ID,
    }),
    [filters, page],
  );

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listings(query);
      setListingsData(data);
      setListings(data.items);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to load listings.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // This effect synchronizes the listing grid with the current search query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (view === "trips") loadTrips();
    if (view === "host") loadHostDashboard();
  }, [view]);

  async function openListing(id: number) {
    try {
      const listing = await api.listing(id);
      setSelectedListing(listing);
      setBooking({ checkIn: filters.checkIn || today, checkOut: filters.checkOut, guests: filters.guests });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to open listing.");
    }
  }

  async function loadTrips() {
    try {
      setTrips(await api.trips(GUEST_USER_ID));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to load trips.");
    }
  }

  async function loadHostDashboard() {
    try {
      const [ownedListings, bookings] = await Promise.all([api.hostListings(HOST_USER_ID), api.hostBookings(HOST_USER_ID)]);
      setHostListings(ownedListings);
      setHostBookings(bookings);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to load host dashboard.");
    }
  }

  async function submitBooking() {
    if (!selectedListing) return;
    if (!booking.checkIn || !booking.checkOut || nightsBetween(booking.checkIn, booking.checkOut) < 1) {
      setToast("Choose a valid check-in and check-out date.");
      return;
    }
    if (booking.guests > selectedListing.max_guests) {
      setToast(`This stay allows up to ${selectedListing.max_guests} guests.`);
      return;
    }
    if (overlapsBookedDates(selectedListing, booking.checkIn, booking.checkOut)) {
      setToast("Those dates are already booked.");
      return;
    }
    try {
      const result = await api.book({
        user_id: GUEST_USER_ID,
        listing_id: selectedListing.id,
        check_in: booking.checkIn,
        check_out: booking.checkOut,
        guests: booking.guests,
      });
      setToast(`Booking confirmed: ${result.confirmation_code}`);
      await openListing(selectedListing.id);
      await loadListings();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create booking.");
    }
  }

  async function toggleFavorite(listing: Listing) {
    try {
      if (listing.is_favorite) {
        await api.unfavorite(GUEST_USER_ID, listing.id);
      } else {
        await api.favorite(GUEST_USER_ID, listing.id);
      }
      setListings((current) => current.map((item) => (item.id === listing.id ? { ...item, is_favorite: !item.is_favorite } : item)));
      if (selectedListing?.id === listing.id) {
        setSelectedListing({ ...selectedListing, is_favorite: !selectedListing.is_favorite });
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update wishlist.");
    }
  }

  function startEdit(listing: Listing) {
    setEditingListingId(listing.id);
    setForm({
      host_id: HOST_USER_ID,
      title: listing.title,
      description: listing.description,
      city: listing.city,
      country: listing.country,
      address: listing.address,
      property_type: listing.property_type,
      price_per_night: listing.price_per_night,
      cleaning_fee: listing.cleaning_fee,
      service_fee: listing.service_fee,
      max_guests: listing.max_guests,
      bedrooms: listing.bedrooms,
      beds: listing.beds,
      bathrooms: listing.bathrooms,
      latitude: listing.latitude,
      longitude: listing.longitude,
      is_superhost: listing.is_superhost,
      photos: listing.photos,
      amenities: listing.amenities,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingListingId(null);
    setForm(defaultListingForm);
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingListingId) {
        await api.updateListing(editingListingId, form);
        setToast("Listing updated.");
      } else {
        await api.createListing(form);
        setToast("Listing created.");
      }
      resetForm();
      await Promise.all([loadListings(), loadHostDashboard()]);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save listing.");
    }
  }

  async function deleteListing(id: number) {
    try {
      await api.deleteListing(id, HOST_USER_ID);
      setToast("Listing removed from marketplace.");
      await Promise.all([loadListings(), loadHostDashboard()]);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to delete listing.");
    }
  }

  const selectedNights = nightsBetween(booking.checkIn, booking.checkOut);
  const selectedTotal = selectedListing ? selectedNights * selectedListing.price_per_night + selectedListing.cleaning_fee + selectedListing.service_fee : 0;
  const totalPages = listingsData ? Math.max(1, Math.ceil(listingsData.total / listingsData.page_size)) : 1;

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <button onClick={() => setView("explore")} className="flex items-center gap-2 text-xl font-bold text-[#ff385c]">
              <span className="flex size-9 items-center justify-center rounded-full bg-[#ff385c] text-sm font-black text-white">A</span>
              airbnb
            </button>
            <nav className="hidden rounded-full border border-neutral-200 p-1 text-sm font-medium shadow-sm md:flex">
              {(["explore", "trips", "host"] as View[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setView(item)}
                  className={`rounded-full px-5 py-2 capitalize transition ${view === item ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}
                >
                  {item === "host" ? "Host" : item}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-3 rounded-full border border-neutral-200 px-4 py-2 shadow-sm">
              <span className="text-sm font-semibold">Guest / Host demo</span>
              <span className="size-8 rounded-full bg-neutral-900 text-center text-sm leading-8 text-white">MS</span>
            </div>
          </div>

          <section className="grid gap-2 rounded-full border border-neutral-200 bg-white p-2 shadow-lg md:grid-cols-[1.2fr_1fr_1fr_.7fr_auto]">
            <label className="rounded-full px-4 py-2 hover:bg-neutral-50">
              <span className="block text-xs font-bold">Where</span>
              <input
                value={filters.location}
                onChange={(event) => {
                  setPage(1);
                  setFilters({ ...filters, location: event.target.value });
                }}
                placeholder="Search destinations"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <label className="rounded-full px-4 py-2 hover:bg-neutral-50">
              <span className="block text-xs font-bold">Check in</span>
              <input
                type="date"
                min={today}
                value={filters.checkIn}
                onChange={(event) => setFilters({ ...filters, checkIn: event.target.value })}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <label className="rounded-full px-4 py-2 hover:bg-neutral-50">
              <span className="block text-xs font-bold">Check out</span>
              <input
                type="date"
                min={filters.checkIn || today}
                value={filters.checkOut}
                onChange={(event) => setFilters({ ...filters, checkOut: event.target.value })}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <label className="rounded-full px-4 py-2 hover:bg-neutral-50">
              <span className="block text-xs font-bold">Who</span>
              <input
                type="number"
                min={1}
                value={filters.guests}
                onChange={(event) => {
                  setPage(1);
                  setFilters({ ...filters, guests: Number(event.target.value) });
                }}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <button onClick={() => loadListings()} className="rounded-full bg-[#ff385c] px-7 py-3 text-sm font-bold text-white">
              Search
            </button>
          </section>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {["Any", ...(listingsData?.property_types ?? [])].map((type) => (
            <button
              key={type}
              onClick={() => {
                setPage(1);
                setFilters({ ...filters, propertyType: type });
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                filters.propertyType === type ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-900"
              }`}
            >
              {type}
            </button>
          ))}
          <label className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm">
            Min
            <input
              value={filters.minPrice}
              onChange={(event) => {
                setPage(1);
                setFilters({ ...filters, minPrice: event.target.value });
              }}
              className="w-16 outline-none"
              placeholder="$0"
            />
          </label>
          <label className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm">
            Max
            <input
              value={filters.maxPrice}
              onChange={(event) => {
                setPage(1);
                setFilters({ ...filters, maxPrice: event.target.value });
              }}
              className="w-16 outline-none"
              placeholder="$500"
            />
          </label>
          {(listingsData?.amenities ?? []).slice(0, 7).map((amenity) => {
            const active = filters.amenities.includes(amenity);
            return (
              <button
                key={amenity}
                onClick={() => {
                  setPage(1);
                  setFilters({
                    ...filters,
                    amenities: active ? filters.amenities.filter((item) => item !== amenity) : [...filters.amenities, amenity],
                  });
                }}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm ${active ? "border-[#ff385c] bg-rose-50 text-[#d70466]" : "border-neutral-200"}`}
              >
                {amenity}
              </button>
            );
          })}
        </div>

        {view === "explore" && (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">{listingsData?.total ?? 0} stays available</p>
                <h1 className="text-2xl font-semibold tracking-tight">Find your next stay</h1>
              </div>
              <div className="hidden rounded-3xl bg-neutral-100 px-4 py-2 text-sm font-semibold md:block">Static map preview included below</div>
            </div>

            {loading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-80 animate-pulse rounded-3xl bg-neutral-100" />
                ))}
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <article key={listing.id} className="group cursor-pointer" onClick={() => openListing(listing.id)}>
                    <div className="relative mb-3 aspect-[1.08] overflow-hidden rounded-3xl bg-neutral-100">
                      <ListingImage src={listing.photos[0]} alt={listing.title} className="transition duration-500 group-hover:scale-105" />
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(listing);
                        }}
                        className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-2 text-xs font-bold shadow"
                      >
                        {listing.is_favorite ? "Saved" : "Save"}
                      </button>
                      {listing.is_superhost && <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-bold shadow">Guest favorite</span>}
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{listing.city}, {listing.country}</h2>
                        <p className="line-clamp-1 text-sm text-neutral-500">{listing.title}</p>
                        <p className="text-sm text-neutral-500">{listing.beds} beds - {listing.property_type}</p>
                        <p className="mt-1"><span className="font-semibold">{formatMoney(listing.price_per_night)}</span> night</p>
                      </div>
                      <p className="text-sm font-medium">Star {listing.rating.toFixed(2)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="mt-10 flex items-center justify-center gap-3">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full border px-5 py-2 disabled:opacity-40">Previous</button>
              <span className="text-sm font-semibold">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-full border px-5 py-2 disabled:opacity-40">Next</button>
            </div>

            <section className="mt-10 overflow-hidden rounded-4xl border bg-neutral-950 text-white">
              <div className="grid md:grid-cols-2">
                <div className="p-8">
                  <p className="text-sm uppercase tracking-[0.3em] text-neutral-400">Map placeholder</p>
                  <h2 className="mt-3 text-3xl font-semibold">Explore stays around the world</h2>
                  <p className="mt-3 text-neutral-300">A production build could swap this for live pins. For this assignment, the map panel keeps the Airbnb layout feel without external map services.</p>
                </div>
                <div className="relative min-h-72 bg-[radial-gradient(circle_at_30%_30%,#ff385c,transparent_25%),radial-gradient(circle_at_70%_60%,#00a699,transparent_20%),linear-gradient(135deg,#f7f7f7,#d9d9d9)]">
                  {listings.slice(0, 4).map((listing, index) => (
                    <button
                      key={listing.id}
                      onClick={() => openListing(listing.id)}
                      className="absolute rounded-full bg-white px-3 py-1 text-sm font-bold text-neutral-900 shadow-xl"
                      style={{ left: `${18 + index * 17}%`, top: `${26 + (index % 2) * 28}%` }}
                    >
                      {formatMoney(listing.price_per_night)}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {view === "trips" && (
          <section>
            <h1 className="text-3xl font-semibold">My trips</h1>
            <p className="mt-2 text-neutral-500">Confirmed bookings persist in SQLite and block future overlapping reservations.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {trips.map((trip) => (
                <article key={trip.id} className="overflow-hidden rounded-3xl border shadow-sm">
                  <div className="relative h-56">
                    <ListingImage src={trip.photo} alt={trip.title} />
                  </div>
                  <div className="p-5">
                    <p className="text-sm font-bold text-[#ff385c]">{trip.confirmation_code}</p>
                    <h2 className="mt-1 text-xl font-semibold">{trip.title}</h2>
                    <p className="text-neutral-500">{trip.city}, {trip.country}</p>
                    <p className="mt-3 text-sm">{trip.check_in} to {trip.check_out} - {trip.guests} guests</p>
                    <p className="mt-3 font-semibold">{formatMoney(trip.total_price)} total</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "host" && (
          <section className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <h1 className="text-3xl font-semibold">Host dashboard</h1>
              <p className="mt-2 text-neutral-500">Create, edit, delete, and monitor bookings for owned stays.</p>
              <form onSubmit={submitListing} className="mt-6 space-y-4 rounded-4xl border p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{editingListingId ? "Edit listing" : "Create a listing"}</h2>
                  {editingListingId && <button type="button" onClick={resetForm} className="text-sm font-bold underline">Cancel edit</button>}
                </div>
                <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Listing title" className="w-full rounded-2xl border px-4 py-3 outline-none" />
                <textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" className="min-h-28 w-full rounded-2xl border px-4 py-3 outline-none" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="City" className="rounded-2xl border px-4 py-3 outline-none" />
                  <input required value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="Country" className="rounded-2xl border px-4 py-3 outline-none" />
                  <input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Address" className="rounded-2xl border px-4 py-3 outline-none" />
                  <input required value={form.property_type} onChange={(event) => setForm({ ...form, property_type: event.target.value })} placeholder="Property type" className="rounded-2xl border px-4 py-3 outline-none" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["price_per_night", "Nightly price"],
                    ["cleaning_fee", "Cleaning fee"],
                    ["service_fee", "Service fee"],
                    ["max_guests", "Max guests"],
                    ["bedrooms", "Bedrooms"],
                    ["beds", "Beds"],
                  ].map(([key, label]) => (
                    <label key={key} className="text-sm font-semibold">
                      {label}
                      <input
                        type="number"
                        min={key === "bedrooms" ? 0 : 1}
                        value={form[key as keyof ListingPayload] as number}
                        onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
                        className="mt-1 w-full rounded-2xl border px-4 py-3 outline-none"
                      />
                    </label>
                  ))}
                </div>
                <label className="block text-sm font-semibold">
                  Bathrooms
                  <input type="number" step="0.5" min="0.5" value={form.bathrooms} onChange={(event) => setForm({ ...form, bathrooms: Number(event.target.value) })} className="mt-1 w-full rounded-2xl border px-4 py-3 outline-none" />
                </label>
                <label className="block text-sm font-semibold">
                  Photo URLs, one per line
                  <textarea value={form.photos.join("\n")} onChange={(event) => setForm({ ...form, photos: splitLines(event.target.value) })} className="mt-1 min-h-24 w-full rounded-2xl border px-4 py-3 outline-none" />
                </label>
                <label className="block text-sm font-semibold">
                  Amenities, one per line
                  <textarea value={form.amenities.join("\n")} onChange={(event) => setForm({ ...form, amenities: splitLines(event.target.value) })} className="mt-1 min-h-24 w-full rounded-2xl border px-4 py-3 outline-none" />
                </label>
                <button className="w-full rounded-full bg-[#ff385c] px-6 py-3 font-bold text-white">{editingListingId ? "Save changes" : "Publish listing"}</button>
              </form>
            </div>

            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-semibold">Your listings</h2>
                <div className="mt-4 space-y-4">
                  {hostListings.map((listing) => (
                    <article key={listing.id} className="grid gap-4 rounded-3xl border p-3 shadow-sm sm:grid-cols-[180px_1fr]">
                      <div className="relative h-40 overflow-hidden rounded-2xl">
                        <ListingImage src={listing.photos[0]} alt={listing.title} />
                      </div>
                      <div className="flex flex-col justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">{listing.title}</h3>
                          <p className="text-sm text-neutral-500">{listing.city}, {listing.country}</p>
                          <p className="mt-2 text-sm">{formatMoney(listing.price_per_night)} night - {listing.max_guests} guests</p>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button onClick={() => startEdit(listing)} className="rounded-full border px-4 py-2 text-sm font-bold">Edit</button>
                          <button onClick={() => deleteListing(listing.id)} className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white">Delete</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold">Booking requests</h2>
                <div className="mt-4 space-y-3">
                  {hostBookings.map((item) => (
                    <article key={item.id} className="rounded-3xl border p-4">
                      <p className="text-sm font-bold text-[#ff385c]">{item.status}</p>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-sm text-neutral-500">{item.guest_name} - {item.check_in} to {item.check_out}</p>
                      <p className="mt-2 text-sm font-semibold">{formatMoney(item.total_price)}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}
      </div>

      {selectedListing && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-3 backdrop-blur-sm md:p-8" onClick={() => setSelectedListing(null)}>
          <section className="mx-auto max-w-5xl rounded-4xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold">{selectedListing.title}</h2>
                <p className="text-sm text-neutral-500">Star {selectedListing.rating.toFixed(2)} - {selectedListing.review_count} reviews - {selectedListing.city}</p>
              </div>
              <button onClick={() => setSelectedListing(null)} className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold">Close</button>
            </div>
            <div className="p-6">
              <div className="grid gap-2 overflow-hidden rounded-3xl md:grid-cols-4 md:grid-rows-2">
                {selectedListing.photos.slice(0, 5).map((photo, index) => (
                  <div key={photo + index} className={`relative min-h-48 ${index === 0 ? "md:col-span-2 md:row-span-2 md:min-h-96" : ""}`}>
                    <ListingImage src={photo} alt={`${selectedListing.title} photo ${index + 1}`} />
                  </div>
                ))}
              </div>
              <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
                <div>
                  <h3 className="text-2xl font-semibold">{selectedListing.property_type} hosted by {selectedListing.host_name}</h3>
                  <p className="mt-1 text-neutral-500">{selectedListing.max_guests} guests - {selectedListing.bedrooms} bedrooms - {selectedListing.beds} beds - {selectedListing.bathrooms} baths</p>
                  <div className="mt-6 flex items-center gap-4 border-y py-6">
                    <Image src={selectedListing.host_avatar_url} alt={selectedListing.host_name} width={56} height={56} className="size-14 rounded-full object-cover" />
                    <div>
                      <p className="font-semibold">{selectedListing.is_superhost ? "Superhost" : "Experienced host"}</p>
                      <p className="text-sm text-neutral-500">{selectedListing.host_bio ?? "Thoughtful local recommendations and responsive support."}</p>
                    </div>
                  </div>
                  <p className="mt-6 leading-7 text-neutral-700">{selectedListing.description}</p>
                  <section className="mt-8">
                    <h4 className="text-xl font-semibold">What this place offers</h4>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {selectedListing.amenities.map((amenity) => <p key={amenity} className="rounded-2xl border px-4 py-3">{amenity}</p>)}
                    </div>
                  </section>
                  <section className="mt-8 rounded-3xl bg-neutral-100 p-5">
                    <h4 className="text-xl font-semibold">Availability</h4>
                    <p className="mt-2 text-sm text-neutral-600">Already booked dates are blocked by the API. Existing reservations:</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(selectedListing.booked_ranges ?? []).map((range) => (
                        <span key={`${range.check_in}-${range.check_out}`} className="rounded-full bg-white px-3 py-1 text-sm font-semibold">
                          {range.check_in} to {range.check_out}
                        </span>
                      ))}
                    </div>
                  </section>
                  <section className="mt-8">
                    <h4 className="text-xl font-semibold">Reviews</h4>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {(selectedListing.reviews ?? []).map((review) => (
                        <article key={review.id} className="rounded-3xl border p-4">
                          <div className="flex items-center gap-3">
                            <Image src={review.user_avatar_url} alt={review.user_name} width={40} height={40} className="size-10 rounded-full object-cover" />
                            <div>
                              <p className="font-semibold">{review.user_name}</p>
                              <p className="text-xs text-neutral-500">{review.rating}/5 rating</p>
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-neutral-700">{review.comment}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="h-fit rounded-3xl border p-5 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <p><span className="text-2xl font-semibold">{formatMoney(selectedListing.price_per_night)}</span> night</p>
                    <button onClick={() => toggleFavorite(selectedListing)} className="rounded-full border px-4 py-2 text-sm font-bold">
                      {selectedListing.is_favorite ? "Saved" : "Save"}
                    </button>
                  </div>
                  <div className="mt-5 overflow-hidden rounded-2xl border">
                    <div className="grid grid-cols-2">
                      <label className="border-r p-3 text-xs font-bold">
                        Check-in
                        <input type="date" min={today} value={booking.checkIn} onChange={(event) => setBooking({ ...booking, checkIn: event.target.value })} className="mt-1 w-full text-sm font-normal outline-none" />
                      </label>
                      <label className="p-3 text-xs font-bold">
                        Check-out
                        <input type="date" min={booking.checkIn || today} value={booking.checkOut} onChange={(event) => setBooking({ ...booking, checkOut: event.target.value })} className="mt-1 w-full text-sm font-normal outline-none" />
                      </label>
                    </div>
                    <label className="block border-t p-3 text-xs font-bold">
                      Guests
                      <input type="number" min={1} max={selectedListing.max_guests} value={booking.guests} onChange={(event) => setBooking({ ...booking, guests: Number(event.target.value) })} className="mt-1 w-full text-sm font-normal outline-none" />
                    </label>
                  </div>
                  {overlapsBookedDates(selectedListing, booking.checkIn, booking.checkOut) && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-[#d70466]">Those dates are unavailable.</p>}
                  <button onClick={submitBooking} className="mt-5 w-full rounded-full bg-[#ff385c] px-6 py-3 font-bold text-white">Reserve</button>
                  <p className="mt-3 text-center text-sm text-neutral-500">You will not be charged. Checkout is mocked.</p>
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between"><span>{formatMoney(selectedListing.price_per_night)} x {selectedNights || 0} nights</span><span>{formatMoney(selectedListing.price_per_night * selectedNights)}</span></div>
                    <div className="flex justify-between"><span>Cleaning fee</span><span>{formatMoney(selectedListing.cleaning_fee)}</span></div>
                    <div className="flex justify-between"><span>Airbnb service fee</span><span>{formatMoney(selectedListing.service_fee)}</span></div>
                    <div className="flex justify-between border-t pt-3 text-base font-bold"><span>Total</span><span>{formatMoney(selectedTotal)}</span></div>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">{toast}</div>}
    </main>
  );
}
