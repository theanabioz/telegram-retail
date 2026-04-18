# Implementation Steps

### Phase 1: Foundation
- [ ] Initialize React + Vite + Chakra UI + Tailwind.
- [ ] Setup `@twa-dev/sdk`.
- [ ] Create a `theme.ts` that links Chakra UI to Telegram's `var(--tg-theme-*)`.
- [ ] Setup Zustand store for User, Cart, and Shift state.

### Phase 2: Auth & Backend
- [ ] Create Node.js Express server.
- [ ] Implement Telegram `initData` validation.
- [ ] Connect Supabase and create the initial schema (SQL).
- [ ] Implement `/auth` endpoint to sync Telegram users with the DB.

### Phase 3: Seller Functionality
- [ ] **Tab 1: Sales.** Product list, search, cart, and "Custom Price" modal for discounts.
- [ ] **Tab 2: Inventory.** Real-time stock levels for the assigned store with manual edit.
- [ ] **Tab 3: Stats.** Daily/Monthly revenue for the specific seller.
- [ ] **Tab 4: Shift.** Timer logic (Start/Stop/Pause) synced with server time.

### Phase 4: Admin Functionality
- [ ] **Tab 1: Dashboard.** Global revenue cards + Real-time sales feed.
- [ ] **Tab 2: Global Inventory.** View stocks across all locations.
- [ ] **Tab 3: Store Management.** CRUD for stores + link sellers to stores.
- [ ] **Tab 4: Staff Management.** CRUD for users, view individual performance & shift history.

### Phase 5: Polishing
- [ ] Ensure seamless Light/Dark mode transitions.
- [ ] Add "Pull-to-refresh" where applicable.
- [ ] Final security audit (RLS in Supabase).