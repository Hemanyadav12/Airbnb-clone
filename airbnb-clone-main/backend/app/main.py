from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "airbnb.sqlite3"

app = FastAPI(title="Airbnb Clone API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


class BookingCreate(BaseModel):
    user_id: int = 1
    listing_id: int
    check_in: date
    check_out: date
    guests: int = Field(ge=1)

    @field_validator("check_out")
    @classmethod
    def checkout_after_checkin(cls, value: date, info: Any) -> date:
        check_in = info.data.get("check_in")
        if check_in and value <= check_in:
            raise ValueError("Check-out must be after check-in.")
        return value


class ListingPayload(BaseModel):
    host_id: int = 2
    title: str = Field(min_length=3)
    description: str = Field(min_length=10)
    city: str = Field(min_length=2)
    country: str = Field(min_length=2)
    address: str = Field(min_length=3)
    property_type: str = Field(min_length=2)
    price_per_night: int = Field(gt=0)
    cleaning_fee: int = Field(ge=0)
    service_fee: int = Field(ge=0)
    max_guests: int = Field(ge=1)
    bedrooms: int = Field(ge=0)
    beds: int = Field(ge=1)
    bathrooms: float = Field(ge=0.5)
    latitude: float = 40.7128
    longitude: float = -74.006
    is_superhost: bool = False
    photos: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)


def rows_to_list(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def nights_between(check_in: str | date, check_out: str | date) -> int:
    start = date.fromisoformat(str(check_in))
    end = date.fromisoformat(str(check_out))
    return (end - start).days


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('guest', 'host')),
            avatar_url TEXT NOT NULL,
            bio TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            city TEXT NOT NULL,
            country TEXT NOT NULL,
            address TEXT NOT NULL,
            property_type TEXT NOT NULL,
            price_per_night INTEGER NOT NULL,
            cleaning_fee INTEGER NOT NULL,
            service_fee INTEGER NOT NULL,
            max_guests INTEGER NOT NULL,
            bedrooms INTEGER NOT NULL,
            beds INTEGER NOT NULL,
            bathrooms REAL NOT NULL,
            rating REAL NOT NULL DEFAULT 4.8,
            review_count INTEGER NOT NULL DEFAULT 0,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            is_superhost INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS listing_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS amenities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS listing_amenities (
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
            PRIMARY KEY (listing_id, amenity_id)
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            check_in TEXT NOT NULL,
            check_out TEXT NOT NULL,
            guests INTEGER NOT NULL,
            total_price INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'confirmed',
            confirmation_code TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS favorites (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, listing_id)
        );
        """
    )


def seed_database(conn: sqlite3.Connection) -> None:
    existing = conn.execute("SELECT COUNT(*) AS count FROM listings").fetchone()["count"]
    if existing:
        return

    users = [
        ("Maya Stone", "guest", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80", "Weekend explorer and food lover."),
        ("Jon Bell", "host", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80", "Designer, host, and neighborhood guide."),
        ("Lina Park", "host", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80", "Superhost with a soft spot for beautiful homes."),
    ]
    conn.executemany("INSERT INTO users (name, role, avatar_url, bio) VALUES (?, ?, ?, ?)", users)

    amenities = ["Wifi", "Kitchen", "Pool", "Free parking", "Washer", "Air conditioning", "Dedicated workspace", "Hot tub", "Pet friendly", "Self check-in"]
    conn.executemany("INSERT INTO amenities (name) VALUES (?)", [(name,) for name in amenities])

    listings = [
        {
            "host_id": 2,
            "title": "Sunny loft steps from SoHo",
            "description": "A bright, design-led loft with oversized windows, warm oak floors, and a chef-ready kitchen in the middle of downtown energy.",
            "city": "New York",
            "country": "United States",
            "address": "42 Grand Street",
            "property_type": "Loft",
            "price_per_night": 248,
            "cleaning_fee": 75,
            "service_fee": 64,
            "max_guests": 4,
            "bedrooms": 2,
            "beds": 2,
            "bathrooms": 1.5,
            "rating": 4.93,
            "review_count": 128,
            "latitude": 40.721,
            "longitude": -74.002,
            "is_superhost": 1,
            "photos": [
                "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
            ],
            "amenities": ["Wifi", "Kitchen", "Air conditioning", "Dedicated workspace", "Self check-in"],
        },
        {
            "host_id": 3,
            "title": "Minimal beach house with ocean views",
            "description": "Wake up to soft light and sea air in a calm beach retreat with an open deck, outdoor shower, and sunset dining space.",
            "city": "Malibu",
            "country": "United States",
            "address": "18 Pacific Coast Highway",
            "property_type": "House",
            "price_per_night": 410,
            "cleaning_fee": 110,
            "service_fee": 92,
            "max_guests": 6,
            "bedrooms": 3,
            "beds": 3,
            "bathrooms": 2,
            "rating": 4.91,
            "review_count": 86,
            "latitude": 34.025,
            "longitude": -118.779,
            "is_superhost": 1,
            "photos": [
                "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1200&q=80",
            ],
            "amenities": ["Wifi", "Kitchen", "Free parking", "Washer", "Pet friendly"],
        },
        {
            "host_id": 2,
            "title": "Historic garden flat near Notting Hill",
            "description": "A quiet lower-ground flat with private garden access, curated vintage furniture, and quick Tube access across London.",
            "city": "London",
            "country": "United Kingdom",
            "address": "7 Ledbury Road",
            "property_type": "Apartment",
            "price_per_night": 196,
            "cleaning_fee": 58,
            "service_fee": 42,
            "max_guests": 3,
            "bedrooms": 1,
            "beds": 2,
            "bathrooms": 1,
            "rating": 4.82,
            "review_count": 74,
            "latitude": 51.515,
            "longitude": -0.202,
            "is_superhost": 0,
            "photos": [
                "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
            ],
            "amenities": ["Wifi", "Kitchen", "Washer", "Dedicated workspace"],
        },
        {
            "host_id": 3,
            "title": "Ryokan-inspired cabin in the pines",
            "description": "A cedar cabin with tatami details, soaking tub, and forest views from every room. Perfect for a quiet recharge.",
            "city": "Hakone",
            "country": "Japan",
            "address": "12 Ashinoyu",
            "property_type": "Cabin",
            "price_per_night": 285,
            "cleaning_fee": 80,
            "service_fee": 61,
            "max_guests": 4,
            "bedrooms": 2,
            "beds": 4,
            "bathrooms": 1,
            "rating": 4.97,
            "review_count": 53,
            "latitude": 35.232,
            "longitude": 139.106,
            "is_superhost": 1,
            "photos": [
                "https://images.unsplash.com/photo-1542718610-a1d656d1884c?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80",
            ],
            "amenities": ["Wifi", "Kitchen", "Hot tub", "Free parking", "Air conditioning"],
        },
        {
            "host_id": 2,
            "title": "Canal view studio in Jordaan",
            "description": "Compact and calm studio overlooking a classic canal, with a comfortable bed nook, espresso setup, and bikes nearby.",
            "city": "Amsterdam",
            "country": "Netherlands",
            "address": "91 Prinsengracht",
            "property_type": "Studio",
            "price_per_night": 172,
            "cleaning_fee": 45,
            "service_fee": 38,
            "max_guests": 2,
            "bedrooms": 1,
            "beds": 1,
            "bathrooms": 1,
            "rating": 4.79,
            "review_count": 92,
            "latitude": 52.373,
            "longitude": 4.884,
            "is_superhost": 0,
            "photos": [
                "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?auto=format&fit=crop&w=1200&q=80",
            ],
            "amenities": ["Wifi", "Kitchen", "Washer", "Self check-in"],
        },
        {
            "host_id": 3,
            "title": "Palm Springs poolside casita",
            "description": "A playful desert casita with mountain views, private patio, pool access, and mid-century touches throughout.",
            "city": "Palm Springs",
            "country": "United States",
            "address": "200 Canyon Drive",
            "property_type": "Guesthouse",
            "price_per_night": 235,
            "cleaning_fee": 70,
            "service_fee": 54,
            "max_guests": 2,
            "bedrooms": 1,
            "beds": 1,
            "bathrooms": 1,
            "rating": 4.88,
            "review_count": 67,
            "latitude": 33.83,
            "longitude": -116.545,
            "is_superhost": 1,
            "photos": [
                "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
            ],
            "amenities": ["Wifi", "Pool", "Free parking", "Air conditioning", "Hot tub"],
        },
    ]

    for item in listings:
        payload = item.copy()
        photos = payload.pop("photos")
        listing_amenities = payload.pop("amenities")
        columns = ", ".join(payload.keys())
        placeholders = ", ".join("?" for _ in payload)
        cursor = conn.execute(f"INSERT INTO listings ({columns}) VALUES ({placeholders})", tuple(payload.values()))
        listing_id = cursor.lastrowid
        conn.executemany(
            "INSERT INTO listing_photos (listing_id, url, sort_order) VALUES (?, ?, ?)",
            [(listing_id, url, index) for index, url in enumerate(photos)],
        )
        for amenity in listing_amenities:
            amenity_id = conn.execute("SELECT id FROM amenities WHERE name = ?", (amenity,)).fetchone()["id"]
            conn.execute("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (?, ?)", (listing_id, amenity_id))

    seed_bookings = [
        (1, 1, "2026-09-18", "2026-09-21", 2),
        (2, 1, "2026-10-04", "2026-10-08", 4),
        (4, 1, "2026-11-12", "2026-11-16", 2),
    ]
    for listing_id, user_id, check_in, check_out, guests in seed_bookings:
        listing = conn.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
        nights = nights_between(check_in, check_out)
        total = nights * listing["price_per_night"] + listing["cleaning_fee"] + listing["service_fee"]
        code = f"AIR{listing_id}{datetime.utcnow().strftime('%H%M%S%f')[-6:]}"
        conn.execute(
            """
            INSERT INTO bookings (listing_id, user_id, check_in, check_out, guests, total_price, confirmation_code)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (listing_id, user_id, check_in, check_out, guests, total, code),
        )

    reviews = [
        (1, 1, 5, "Exactly the kind of airy downtown stay we were hoping for."),
        (1, 1, 5, "Beautiful interiors, easy check-in, and a perfect location."),
        (2, 1, 5, "The deck at sunset made the whole trip."),
        (4, 1, 5, "Quiet, thoughtful, and incredibly restorative."),
    ]
    conn.executemany("INSERT INTO reviews (listing_id, user_id, rating, comment) VALUES (?, ?, ?, ?)", reviews)
    conn.executemany("INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)", [(1, 2), (1, 4)])


def listing_summary(conn: sqlite3.Connection, row: sqlite3.Row, user_id: int = 1) -> dict[str, Any]:
    listing_id = row["id"]
    photos = rows_to_list(conn.execute("SELECT url FROM listing_photos WHERE listing_id = ? ORDER BY sort_order", (listing_id,)).fetchall())
    amenities = rows_to_list(
        conn.execute(
            """
            SELECT a.name FROM amenities a
            JOIN listing_amenities la ON la.amenity_id = a.id
            WHERE la.listing_id = ?
            ORDER BY a.name
            """,
            (listing_id,),
        ).fetchall()
    )
    favorite = conn.execute("SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?", (user_id, listing_id)).fetchone()
    result = dict(row)
    result["photos"] = [photo["url"] for photo in photos]
    result["amenities"] = [amenity["name"] for amenity in amenities]
    result["is_favorite"] = bool(favorite)
    result["is_superhost"] = bool(result["is_superhost"])
    result["is_active"] = bool(result["is_active"])
    return result


def ensure_amenities(conn: sqlite3.Connection, listing_id: int, amenities: list[str]) -> None:
    conn.execute("DELETE FROM listing_amenities WHERE listing_id = ?", (listing_id,))
    for amenity in sorted(set(name.strip() for name in amenities if name.strip())):
        conn.execute("INSERT OR IGNORE INTO amenities (name) VALUES (?)", (amenity,))
        amenity_id = conn.execute("SELECT id FROM amenities WHERE name = ?", (amenity,)).fetchone()["id"]
        conn.execute("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (?, ?)", (listing_id, amenity_id))


def ensure_photos(conn: sqlite3.Connection, listing_id: int, photos: list[str]) -> None:
    conn.execute("DELETE FROM listing_photos WHERE listing_id = ?", (listing_id,))
    valid_photos = [photo.strip() for photo in photos if photo.strip()]
    if not valid_photos:
        valid_photos = ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80"]
    conn.executemany(
        "INSERT INTO listing_photos (listing_id, url, sort_order) VALUES (?, ?, ?)",
        [(listing_id, url, index) for index, url in enumerate(valid_photos[:6])],
    )


@app.on_event("startup")
def startup() -> None:
    with get_db() as conn:
        create_schema(conn)
        seed_database(conn)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/users")
def get_users() -> list[dict[str, Any]]:
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM users ORDER BY id").fetchall())


@app.get("/listings")
def get_listings(
    location: str | None = None,
    guests: int | None = Query(default=None, ge=1),
    property_type: str | None = None,
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    amenity: list[str] = Query(default=[]),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=24),
    user_id: int = 1,
) -> dict[str, Any]:
    filters = ["l.is_active = 1"]
    params: list[Any] = []
    if location:
        filters.append("(LOWER(l.city) LIKE ? OR LOWER(l.country) LIKE ?)")
        value = f"%{location.lower()}%"
        params.extend([value, value])
    if guests:
        filters.append("l.max_guests >= ?")
        params.append(guests)
    if property_type and property_type != "Any":
        filters.append("l.property_type = ?")
        params.append(property_type)
    if min_price is not None:
        filters.append("l.price_per_night >= ?")
        params.append(min_price)
    if max_price is not None:
        filters.append("l.price_per_night <= ?")
        params.append(max_price)
    if amenity:
        placeholders = ", ".join("?" for _ in amenity)
        filters.append(
            f"""
            l.id IN (
                SELECT la.listing_id
                FROM listing_amenities la
                JOIN amenities a ON a.id = la.amenity_id
                WHERE a.name IN ({placeholders})
                GROUP BY la.listing_id
                HAVING COUNT(DISTINCT a.name) = ?
            )
            """
        )
        params.extend(amenity)
        params.append(len(set(amenity)))

    where_clause = " AND ".join(filters)
    with get_db() as conn:
        count = conn.execute(f"SELECT COUNT(*) AS count FROM listings l WHERE {where_clause}", params).fetchone()["count"]
        rows = conn.execute(
            f"""
            SELECT l.*, u.name AS host_name, u.avatar_url AS host_avatar_url
            FROM listings l
            JOIN users u ON u.id = l.host_id
            WHERE {where_clause}
            ORDER BY l.rating DESC, l.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (*params, page_size, (page - 1) * page_size),
        ).fetchall()
        property_types = [row["property_type"] for row in conn.execute("SELECT DISTINCT property_type FROM listings WHERE is_active = 1 ORDER BY property_type").fetchall()]
        amenities = [row["name"] for row in conn.execute("SELECT name FROM amenities ORDER BY name").fetchall()]
        summaries = [listing_summary(conn, row, user_id) for row in rows]

    return {
        "items": summaries,
        "total": count,
        "page": page,
        "page_size": page_size,
        "property_types": property_types,
        "amenities": amenities,
    }


@app.get("/listings/{listing_id}")
def get_listing(listing_id: int, user_id: int = 1) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT l.*, u.name AS host_name, u.avatar_url AS host_avatar_url, u.bio AS host_bio
            FROM listings l
            JOIN users u ON u.id = l.host_id
            WHERE l.id = ? AND l.is_active = 1
            """,
            (listing_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Listing not found")
        result = listing_summary(conn, row, user_id)
        result["booked_ranges"] = rows_to_list(
            conn.execute(
                "SELECT check_in, check_out FROM bookings WHERE listing_id = ? AND status = 'confirmed' ORDER BY check_in",
                (listing_id,),
            ).fetchall()
        )
        result["reviews"] = rows_to_list(
            conn.execute(
                """
                SELECT r.*, u.name AS user_name, u.avatar_url AS user_avatar_url
                FROM reviews r
                JOIN users u ON u.id = r.user_id
                WHERE r.listing_id = ?
                ORDER BY r.created_at DESC
                """,
                (listing_id,),
            ).fetchall()
        )
        return result


@app.post("/bookings")
def create_booking(payload: BookingCreate) -> dict[str, Any]:
    with get_db() as conn:
        listing = conn.execute("SELECT * FROM listings WHERE id = ? AND is_active = 1", (payload.listing_id,)).fetchone()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")
        if payload.guests > listing["max_guests"]:
            raise HTTPException(status_code=400, detail=f"This listing allows up to {listing['max_guests']} guests.")
        conflict = conn.execute(
            """
            SELECT id FROM bookings
            WHERE listing_id = ?
              AND status = 'confirmed'
              AND check_in < ?
              AND check_out > ?
            """,
            (payload.listing_id, payload.check_out.isoformat(), payload.check_in.isoformat()),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="Those dates are unavailable.")

        nights = nights_between(payload.check_in, payload.check_out)
        total = nights * listing["price_per_night"] + listing["cleaning_fee"] + listing["service_fee"]
        code = f"AIR{payload.listing_id}{datetime.utcnow().strftime('%H%M%S%f')[-6:]}"
        cursor = conn.execute(
            """
            INSERT INTO bookings (listing_id, user_id, check_in, check_out, guests, total_price, confirmation_code)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.listing_id,
                payload.user_id,
                payload.check_in.isoformat(),
                payload.check_out.isoformat(),
                payload.guests,
                total,
                code,
            ),
        )
        return {"id": cursor.lastrowid, "confirmation_code": code, "nights": nights, "total_price": total, "status": "confirmed"}


@app.get("/users/{user_id}/trips")
def get_trips(user_id: int = 1) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT b.*, l.title, l.city, l.country, l.price_per_night,
                   (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) AS photo
            FROM bookings b
            JOIN listings l ON l.id = b.listing_id
            WHERE b.user_id = ?
            ORDER BY b.check_in DESC
            """,
            (user_id,),
        ).fetchall()
        return rows_to_list(rows)


@app.get("/hosts/{host_id}/listings")
def get_host_listings(host_id: int = 2) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT l.*, u.name AS host_name, u.avatar_url AS host_avatar_url
            FROM listings l
            JOIN users u ON u.id = l.host_id
            WHERE l.host_id = ? AND l.is_active = 1
            ORDER BY l.created_at DESC
            """,
            (host_id,),
        ).fetchall()
        return [listing_summary(conn, row) for row in rows]


@app.get("/hosts/{host_id}/bookings")
def get_host_bookings(host_id: int = 2) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT b.*, l.title, l.city, l.country, u.name AS guest_name,
                   (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) AS photo
            FROM bookings b
            JOIN listings l ON l.id = b.listing_id
            JOIN users u ON u.id = b.user_id
            WHERE l.host_id = ?
            ORDER BY b.check_in DESC
            """,
            (host_id,),
        ).fetchall()
        return rows_to_list(rows)


@app.post("/listings")
def create_listing(payload: ListingPayload) -> dict[str, Any]:
    data = payload.model_dump(exclude={"photos", "amenities"})
    data["is_superhost"] = int(payload.is_superhost)
    with get_db() as conn:
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        cursor = conn.execute(f"INSERT INTO listings ({columns}) VALUES ({placeholders})", tuple(data.values()))
        listing_id = cursor.lastrowid
        ensure_photos(conn, listing_id, payload.photos)
        ensure_amenities(conn, listing_id, payload.amenities)
    return get_listing(listing_id)


@app.put("/listings/{listing_id}")
def update_listing(listing_id: int, payload: ListingPayload) -> dict[str, Any]:
    data = payload.model_dump(exclude={"photos", "amenities"})
    data["is_superhost"] = int(payload.is_superhost)
    assignments = ", ".join(f"{key} = ?" for key in data)
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM listings WHERE id = ? AND host_id = ? AND is_active = 1", (listing_id, payload.host_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Listing not found for this host.")
        conn.execute(f"UPDATE listings SET {assignments} WHERE id = ?", (*data.values(), listing_id))
        ensure_photos(conn, listing_id, payload.photos)
        ensure_amenities(conn, listing_id, payload.amenities)
    return get_listing(listing_id)


@app.delete("/listings/{listing_id}")
def delete_listing(listing_id: int, host_id: int = 2) -> dict[str, str]:
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM listings WHERE id = ? AND host_id = ? AND is_active = 1", (listing_id, host_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Listing not found for this host.")
        conn.execute("UPDATE listings SET is_active = 0 WHERE id = ?", (listing_id,))
        return {"status": "deleted"}


@app.get("/users/{user_id}/favorites")
def get_favorites(user_id: int = 1) -> list[int]:
    with get_db() as conn:
        rows = conn.execute("SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        return [row["listing_id"] for row in rows]


@app.post("/users/{user_id}/favorites/{listing_id}")
def add_favorite(user_id: int, listing_id: int) -> dict[str, str]:
    with get_db() as conn:
        conn.execute("INSERT OR IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)", (user_id, listing_id))
        return {"status": "favorited"}


@app.delete("/users/{user_id}/favorites/{listing_id}")
def remove_favorite(user_id: int, listing_id: int) -> dict[str, str]:
    with get_db() as conn:
        conn.execute("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?", (user_id, listing_id))
        return {"status": "removed"}
