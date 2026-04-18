# Business Rules

## Product Vision
- Telegram Mini App for retail POS and inventory control.
- Interface style: lightweight, minimalist, mobile-first, fast for one-hand use.
- Two main operating roles: `admin` and `seller`.

## Roles And Access

### Admin
- Has full access to all stores, users, sales, returns, inventory, and reports.
- Can create, edit, disable, and reassign sellers to another store.
- Cannot create sales as an admin.
- Can switch into any seller account for operational support.
- Can manually adjust inventory from the admin interface.

### Seller
- Works only inside the store currently assigned by the admin.
- Sees only store-scoped products, prices, sales, returns, and inventory.
- Can manually adjust inventory from the seller interface.
- Can create sales, delete completed sales, create returns, and create replacements inside the assigned store.

## Store Assignment
- A seller is assigned to exactly one active store at a time.
- Admin can reassign a seller to another store at any time.
- All seller actions must be restricted to the currently assigned store.
- Shift start is allowed only in the assigned store.

## Shift Rules
- A seller cannot create a sale without an active shift.
- A seller can have only one active shift at a time.
- Shift statuses: `active`, `paused`, `closed`.
- `paused` only marks status and pause duration; it does not close the shift.
- Shift ends only manually.
- Shift reporting is simple:
  - shift date
  - total worked time
  - total paused time
- No cash reconciliation or end-of-shift report is required in MVP.

## Sales Flow
- Cart exists as a draft before checkout.
- A draft cart may contain multiple items.
- Sale is created only after explicit confirmation.
- Sale requires an active shift.
- Payment methods in MVP:
  - `cash`
  - `card`
- A seller can change the item price during a sale.
- Discounts are supported:
  - absolute amount
  - percent
- Completed sales can be deleted.
- Returns are stored as a separate entity, not as direct sale deletion.

## Inventory Rules
- Each store has its own stock levels.
- Each store may set its own active selling price for a product.
- A product may be disabled per store.
- Inventory must use two layers:
  - `inventory` for current balance
  - `inventory_movements` for immutable stock history
- Every stock change must generate a movement row.

## Inventory Movement Types
- `sale`
- `return`
- `manual_adjustment`
- `restock`
- `writeoff`
- `transfer_in`
- `transfer_out`
- `sale_deletion`

## Product Rules
- Global catalog is small, around 20 items.
- Categories are not needed in MVP.
- Products should support:
  - name
  - SKU
  - default price
  - active/inactive status
- Store-specific overrides should support:
  - store price
  - enabled/disabled status

## Returns And Replacements
- Returns are allowed and stored separately from sales.
- Replacement flow should be represented through return + new sale or a dedicated replacement link, depending on implementation convenience.
- Returns and manual inventory changes should always require a reason.
- Write-offs should also require a reason.

## Data Integrity Rules
- Sales must store a snapshot of sold item data at the moment of checkout:
  - product name
  - SKU
  - sold price
  - quantity
  - applied discount
- Inventory changes must be traceable to actor and reason.
- Seller access must always be constrained by assigned store.
- Admin impersonation must be auditable.

## Real-Time Requirements
- Admin dashboard should receive new sales in real time.
- Store inventory views should reflect recent changes quickly.
- Shift status changes should be visible without manual refresh where practical.

## MVP Scope
- Telegram auth with `initData`
- `admin` and `seller` roles
- Seller assignment to one store
- Shift start/pause/stop
- Draft cart and checkout
- Per-store pricing
- Store-scoped inventory
- Inventory movements log
- Sale deletion
- Returns with reasons
- Manual stock adjustments with reasons
- Admin dashboard with real-time sales
- CRUD for stores, products, and sellers
