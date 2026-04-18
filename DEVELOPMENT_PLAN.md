# Development Plan

## Delivery Strategy
- Build the system in vertical slices so business rules become testable early.
- Start from data model and permissions first, then auth, then seller flow, then admin flow.
- Keep UI minimal and operationally fast from the first screens.

## Phase 0: Product Blueprint
- [x] Finalize business rules for roles, shifts, sales, returns, products, and inventory.
- [x] Confirm replacement flow details:
  - use `return + new linked sale` in MVP
- [x] Confirm whether sale deletion should restore inventory automatically.
  - yes, via `inventory_movements` with `sale_deletion`
- [x] Confirm whether deleted sales stay visible in audit history with `deleted_at`.
  - yes, use soft deletion

## Phase 1: Foundation And Repo Setup
- [x] Initialize frontend with `React + Vite`.
- [x] Add `Chakra UI`, `Tailwind CSS`, and `Zustand`.
- [x] Add `@twa-dev/sdk` and Telegram bootstrapping.
- [x] Create app layout shell:
  - safe area handling
  - header
  - bottom navigation
  - page container
- [x] Create lightweight design system:
  - colors
  - spacing
  - radii
  - buttons
  - cards
  - inputs
- [ ] Add environment config for frontend and backend.

## Phase 2: Database And Security
- [x] Design normalized PostgreSQL schema in Supabase.
- [x] Add tables:
  - `users`
  - `stores`
  - `user_store_assignments`
  - `products`
  - `store_products`
  - `inventory`
  - `inventory_movements`
  - `draft_sales`
  - `draft_sale_items`
  - `sales`
  - `sale_items`
  - `returns`
  - `return_items`
  - `shifts`
  - `impersonation_logs`
- [x] Add enums for role, shift status, payment method, movement type.
- [x] Add constraints and indexes.
- [x] Define RLS policies for admin and seller behavior.
- [x] Seed demo data for one admin, several sellers, stores, and products.

## Phase 3: Backend Core
- [x] Create `Express` backend.
- [x] Implement Telegram `initData` validation.
- [x] Implement JWT session issuing.
- [x] Implement current-user endpoint.
- [x] Implement admin impersonation endpoint with audit logging.
- [x] Add shared permission middleware:
  - admin full access
  - seller store-scoped access
- [x] Add service layer for inventory mutations to guarantee movement logging.

## Phase 4: Shifts
- [x] Start shift endpoint.
- [x] Pause shift endpoint.
- [x] Resume shift endpoint.
- [x] Stop shift endpoint.
- [ ] Prevent sales when no active shift exists.
- [x] Calculate worked time and paused time.
- [ ] Add seller shift screen.

## Phase 5: Seller Sales Flow
- [x] Product list for assigned store with local prices and enabled status.
- [x] Search and add-to-cart flow.
- [x] Draft cart persistence.
- [x] Quantity editing in cart.
- [x] Price override and discount UI.
- [x] Checkout with `cash` or `card`.
- [x] Sale creation transaction:
  - create sale
  - create sale items snapshot
  - decrease inventory
  - create inventory movements
- [x] Delete completed sale flow.
- [x] Decide and implement inventory restoration behavior on sale deletion.

## Phase 6: Returns And Manual Adjustments
- [x] Return creation flow with reason.
- [x] Replacement flow.
  - MVP path is `return + new sale`
- [x] Manual inventory adjustment flow with reason.
- [x] Write-off and restock support from operational UI.
- [x] Inventory history screen for audit.

## Phase 7: Admin Area
- [ ] Admin dashboard with:
  - revenue summary
  - active shifts
  - live sales feed
- [ ] Global inventory view across stores.
- [ ] Store management CRUD.
- [ ] Product management CRUD.
- [ ] Seller management CRUD and reassignment.
- [ ] Seller performance and shift history.
- [ ] Admin impersonation entry point.

## Phase 8: Realtime And Hardening
- [ ] Subscribe admin dashboard to new sales via Supabase Realtime.
- [ ] Realtime inventory refresh where needed.
- [ ] Add optimistic UI only where rollback is safe.
- [ ] Add audit-oriented soft deletion where required.
- [ ] Add error states and offline-safe handling for Telegram WebApp environment.

## Phase 9: QA And Launch Readiness
- [ ] Test role boundaries.
- [ ] Test shift restrictions.
- [ ] Test inventory consistency after sale, deletion, return, and adjustment.
- [ ] Test reassignment of seller between stores.
- [ ] Test admin impersonation audit log.
- [ ] Validate responsive behavior on common mobile sizes.
- [ ] Prepare deployment to Vercel and DigitalOcean.

## Recommended Build Order
1. Database schema and RLS.
2. Backend auth and permissions.
3. Shift flow.
4. Seller sales flow.
5. Inventory movements and returns.
6. Admin panel.
7. Realtime and QA.

## Immediate Next Step
- Start shift endpoints and seller shift logic so sales can be correctly gated by active shift state.
