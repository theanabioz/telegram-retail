# Telegram Mini App: POS & Inventory Control System

## Project Overview
A specialized POS (Point of Sale) and Inventory management system designed as a Telegram Mini App. 
The app serves two main roles: Administrators and Sellers. 

## Tech Stack
- **Frontend:** React + Vite + Chakra UI (for components) + Tailwind CSS (for layout).
- **State Management:** Zustand.
- **Backend:** Node.js (Express) hosted on DigitalOcean Droplet.
- **Database:** Supabase (PostgreSQL) + Supabase Realtime.
- **Hosting:** Vercel (Frontend).
- **SDK:** `@twa-dev/sdk` for Telegram integration.

## Design Philosophy
- **Minimalist & Modern:** Clean UI, no clutter.
- **Theme Support:** Native integration with Telegram's light/dark modes using Chakra UI and CSS variables.
- **Mobile First:** Bottom Navigation bar for easy thumb access.

## Roles
1. **Admin:** Global statistics, inventory across all shops, store management, staff management (CRUD).
2. **Seller:** Store-specific sales, inventory control, shift tracking (Start/Pause/Stop), personal stats.

## Project Docs
- [Business Rules](BUSINESS_RULES.md)
- [Architecture](ARCHITECTURE.md)
- [Development Plan](DEVELOPMENT_PLAN.md)
- [Schema Plan](SCHEMA_PLAN.md)
- [Initial Supabase Schema](supabase/migrations/0001_init_schema.sql)
- [Supabase Setup](SUPABASE_SETUP.md)
- [Implementation Steps](STEPS.md)
- [Production Checklist](PRODUCTION_CHECKLIST.md)

## Backend Scaffold
- Backend source: [backend](backend)
- Example env: [backend/.env.example](backend/.env.example)
- Local frontend origins allowed by default:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
- Install: `cd backend && npm install`
- Dev server: `cd backend && npm run dev`
- Build check: `cd backend && npm run build`
- Local dev auth:
  - `POST /auth/dev-login`
  - enabled via `DEV_AUTH_ENABLED=true`
  - uses seeded seller Telegram IDs such as `100000101`
  - uses seeded admin Telegram ID `100000001`
- Main auth routes:
  - `POST /auth/dev-login`
  - `POST /auth/telegram`
  - `GET /auth/me`
  - `POST /auth/impersonate/:sellerId`
  - `POST /auth/impersonate/stop`
- Admin routes:
  - `GET /admin/dashboard`
  - `GET /admin/sales`
  - `GET /admin/inventory`
  - `POST /admin/inventory/adjustment`
  - `GET /admin/products`
  - `POST /admin/products`
  - `PATCH /admin/products/:productId`
  - `PATCH /admin/store-products/:storeProductId`
  - `GET /admin/stores`
  - `POST /admin/stores`
  - `PATCH /admin/stores/:storeId`
  - `GET /admin/staff`
  - `POST /admin/staff/:sellerId/assignment`
- Shift routes:
  - `GET /shifts/current`
  - `POST /shifts/start`
  - `POST /shifts/pause`
  - `POST /shifts/resume`
  - `POST /shifts/stop`
- Seller routes:
  - `GET /seller/catalog`
  - `GET /seller/inventory/history`
  - `POST /seller/inventory/manual-adjustment`
  - `POST /seller/inventory/restock`
  - `POST /seller/inventory/writeoff`
  - `GET /seller/draft`
  - `POST /seller/draft/items`
  - `PATCH /seller/draft/items/:itemId`
  - `DELETE /seller/draft/items/:itemId`
  - `POST /seller/checkout`
  - `POST /seller/sales/:saleId/delete`
  - `POST /seller/returns`

## Frontend Scaffold
- Frontend source: [frontend](frontend)
- Example env: [frontend/.env.example](frontend/.env.example)
- Install: `cd frontend && npm install`
- Dev server: `cd frontend && npm run dev`
- To boot admin locally set `VITE_DEV_PANEL=admin`
- If `VITE_API_BASE_URL` is not set, the frontend automatically calls `http://<current-host>:4000`
- Current UI status:
  - seller panel with tabs: Checkout, Orders, My Stock, Shift, Options
  - admin panel foundation with tabs: Dashboard, Inventory, Stores, Staff, Options
  - admin Sales tab with store, seller, status and date filters
  - admin Inventory tab with global product CRUD, per-store pricing, product availability and stock movement history
  - safety prompts for sale deletion, returns, writeoff, restock and shift stop
  - live admin dashboard with summary, recent sales, active shifts, low stock and store performance
  - live seller bootstrap through local dev auth
  - shift start, pause, resume, stop from UI
  - live product list in Checkout
  - live draft cart with quantity controls and remove
  - live checkout
  - Orders tab with delete sale and return actions
  - My Stock tab with restock, writeoff and inventory history
  - Shift tab with status and worked/paused summary
  - Options tab with session info
  - bottom navigation
  - demo fallback when no active shift exists or API is unavailable
