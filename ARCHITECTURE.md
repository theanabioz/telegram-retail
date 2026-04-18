# System Architecture

## 1. Authentication Flow
- Extract `initData` from Telegram WebApp.
- Send `initData` to Backend (DigitalOcean).
- Backend validates hash using `BOT_TOKEN`.
- Backend returns a JWT and user role (`admin` | `seller`).

## 2. Database Schema (Supabase)
### Tables:
- `users`: `id`, `telegram_id`, `role`, `name`, `current_store_id`.
- `stores`: `id`, `name`, `address`.
- `products`: `id`, `name`, `sku`, `default_price`.
- `inventory`: `store_id`, `product_id`, `quantity`.
- `sales`: `id`, `store_id`, `seller_id`, `total_amount`, `created_at`.
- `sale_items`: `id`, `sale_id`, `product_id`, `quantity`, `sold_price`.
- `shifts`: `id`, `user_id`, `store_id`, `start_time`, `end_time`, `status`.

## 3. Real-time Features
- Admin Dashboard must subscribe to `sales` table changes via Supabase Realtime to display new sales instantly.

## 4. UI Implementation (Chakra UI)
- Use `ChakraProvider` with a custom theme.
- Map Telegram CSS variables (e.g., `--tg-theme-bg-color`) to Chakra's color tokens.
- Bottom Navigation must be a fixed component with 4-5 icons depending on the role.