# Airbnb Clone Fullstack Assignment

A functional Airbnb-style marketplace built with a Next.js TypeScript frontend, FastAPI backend, and SQLite persistence. The app focuses on Airbnb's browse, search, detail, booking, trips, wishlist, and host listing management workflows with mocked payments and seeded data.

## Tech Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, pnpm
- Backend: Python, FastAPI, Pydantic
- Database: SQLite
- Data and media: Seeded local database records with remote placeholder image URLs

## Project Structure

```text
frontend/
  src/app/              Next.js app shell and global styles
  src/components/       Airbnb clone client experience
  src/lib/              Typed API client
backend/
  app/main.py           FastAPI app, SQLite schema, seed data, API routes
  requirements.txt      Python dependencies
```

## Local Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`. On first startup it creates `backend/airbnb.sqlite3` and seeds users, listings, amenities, bookings, reviews, and favorites.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The web app runs at `http://localhost:3000` and expects the API at `http://localhost:8000`. To point it elsewhere:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev
```

## Core Features

- Explore page with Airbnb-like navigation, search bar, listing cards, category filters, price filters, amenity filters, pagination, and static map preview.
- Listing detail modal with photo gallery, host information, amenities, reviews, booked date ranges, date inputs, guest validation, and price breakdown.
- Booking flow with mocked checkout, confirmation code, SQLite persistence, and server-side overlap prevention.
- My Trips view listing confirmed bookings for the demo guest.
- Host dashboard for the demo host with create, edit, delete, owned listing list, and booking visibility.
- Wishlist/favorites with persistent SQLite records.

## Demo Users

- Guest: `Maya Stone` (`user_id = 1`)
- Host: `Jon Bell` (`host_id = 2`)
- Additional seeded host: `Lina Park` (`host_id = 3`)

Authentication is intentionally simplified for the assignment. The UI uses fixed guest and host identities while preserving the database concept of guest and host users.

## Database Schema

- `users`: demo guest and host profiles.
- `listings`: primary property details, prices, capacity, location, rating, host ownership, and active status.
- `listing_photos`: ordered listing photo URLs.
- `amenities`: normalized amenity names.
- `listing_amenities`: many-to-many join table between listings and amenities.
- `bookings`: confirmed reservations with date ranges, guest count, total price, and confirmation code.
- `reviews`: seeded review content and ratings.
- `favorites`: guest wishlist records.

Booking availability is enforced by checking for overlapping confirmed bookings:

```sql
check_in < requested_check_out AND check_out > requested_check_in
```

## API Overview

- `GET /health`
- `GET /users`
- `GET /listings`
- `GET /listings/{listing_id}`
- `POST /bookings`
- `GET /users/{user_id}/trips`
- `GET /hosts/{host_id}/listings`
- `GET /hosts/{host_id}/bookings`
- `POST /listings`
- `PUT /listings/{listing_id}`
- `DELETE /listings/{listing_id}`
- `GET /users/{user_id}/favorites`
- `POST /users/{user_id}/favorites/{listing_id}`
- `DELETE /users/{user_id}/favorites/{listing_id}`

## Assumptions

- Payments are mocked; reserving creates a confirmed booking immediately.
- Authentication is mocked with fixed guest/host IDs.
- Listing photo upload is represented by URL input. Cloud upload is out of scope.
- Map/geolocation is represented by a static visual map panel with price pins.
- Messaging, identity verification, and real payment processing are placeholders/out of scope.
