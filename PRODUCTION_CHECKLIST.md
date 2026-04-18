# Production Readiness Checklist

Telegram Mini App integration is intentionally excluded for now.

## Secrets And Environment
- Rotate the Supabase `service_role` key before any public deployment if it was shared in chat, screenshots, logs, or commits.
- Rotate the Telegram bot token before production if it was shared outside a secret manager.
- Use separate Supabase projects or at least separate env files for development and production.
- Set `DEV_AUTH_ENABLED=false` in production.
- Set a long random `JWT_SECRET` in production and never reuse the development value.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only on the backend runtime.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` through frontend env variables.

## Backend
- Set `FRONTEND_ORIGIN` to the production frontend domain only, plus any explicit staging domains.
- Confirm `/health` responds before connecting the frontend.
- Confirm CORS blocks unknown public origins.
- Confirm admin routes require `admin` role.
- Confirm seller routes require `seller` role.
- Confirm seller actions remain scoped to the current assigned store.

## Frontend
- Set `VITE_API_BASE_URL` to the production backend URL.
- Hide or remove the developer switch before production.
- Keep `VITE_DEV_*` variables only in local/staging environments.
- Run a mobile viewport smoke test for all tabs:
  - Seller Checkout
  - Seller Orders
  - Seller My Stock
  - Seller Shift
  - Seller Options
  - Admin Dashboard
  - Admin Sales
  - Admin Inventory
  - Admin Stores
  - Admin Staff

## Data Safety
- Keep sale deletion as soft-delete only.
- Keep returns as separate records.
- Require reasons for returns, sale deletion, writeoff, restock, and manual adjustment.
- Verify every inventory mutation creates an `inventory_movements` row.
- Verify admin product creation creates `store_products` and `inventory` rows for every store.

## Deployment Smoke Test
- Admin can log in in the target environment.
- Seller can log in in the target environment.
- Seller cannot sell without an active shift.
- Seller can start, pause, resume, and stop a shift.
- Seller can create a sale with multiple items.
- Seller can create a return.
- Seller can delete a completed sale.
- Admin can see completed sales, deleted sales, and returns.
- Admin can create and update global products.
- Admin can update per-store product prices and availability.
- Admin can adjust inventory and see movement history.
- Admin can reassign a seller to another store.
- Admin can view as seller.

## Monitoring
- Capture backend request errors.
- Capture frontend runtime errors.
- Track failed checkout attempts.
- Track inventory adjustment failures.
- Track impersonation start and stop events.
