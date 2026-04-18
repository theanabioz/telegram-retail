# Schema Plan

## Design Principles
- Sellers are always restricted by their current store assignment.
- Inventory balance and inventory history are stored separately.
- Financial and stock events must remain auditable.
- Store-specific pricing and availability are required.
- Sales, deletions, and returns must be traceable.

## Enums

### `user_role`
- `admin`
- `seller`

### `shift_status`
- `active`
- `paused`
- `closed`

### `payment_method`
- `cash`
- `card`

### `inventory_movement_type`
- `sale`
- `return`
- `manual_adjustment`
- `restock`
- `writeoff`
- `transfer_in`
- `transfer_out`
- `sale_deletion`

### `discount_type`
- `amount`
- `percent`

### `sale_status`
- `completed`
- `deleted`

## Core Tables

### `users`
- `id` UUID PK
- `telegram_id` BIGINT UNIQUE NOT NULL
- `role` `user_role` NOT NULL
- `full_name` TEXT NOT NULL
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Purpose:
- Stores both admins and sellers.

### `stores`
- `id` UUID PK
- `name` TEXT NOT NULL
- `address` TEXT
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### `user_store_assignments`
- `id` UUID PK
- `user_id` UUID NOT NULL REFERENCES `users(id)`
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `assigned_by` UUID NOT NULL REFERENCES `users(id)`
- `started_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `ended_at` TIMESTAMPTZ
- `is_current` BOOLEAN NOT NULL DEFAULT TRUE

Rules:
- Only sellers use this table.
- At most one current assignment per seller.
- Reassignment closes the previous row and opens a new one.

### `products`
- `id` UUID PK
- `name` TEXT NOT NULL
- `sku` TEXT NOT NULL UNIQUE
- `default_price` NUMERIC(12,2) NOT NULL
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### `store_products`
- `id` UUID PK
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `product_id` UUID NOT NULL REFERENCES `products(id)`
- `price` NUMERIC(12,2) NOT NULL
- `is_enabled` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Rules:
- Unique pair on `store_id, product_id`.
- Allows per-store pricing and enable/disable behavior.

### `inventory`
- `id` UUID PK
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `product_id` UUID NOT NULL REFERENCES `products(id)`
- `quantity` NUMERIC(12,3) NOT NULL DEFAULT 0
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Rules:
- Unique pair on `store_id, product_id`.
- Stores only current balance.

### `inventory_movements`
- `id` UUID PK
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `product_id` UUID NOT NULL REFERENCES `products(id)`
- `movement_type` `inventory_movement_type` NOT NULL
- `quantity_delta` NUMERIC(12,3) NOT NULL
- `balance_after` NUMERIC(12,3) NOT NULL
- `reason` TEXT
- `actor_user_id` UUID NOT NULL REFERENCES `users(id)`
- `sale_id` UUID
- `return_id` UUID
- `shift_id` UUID
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Rules:
- Immutable audit log.
- Every stock mutation must create one row here.

## Shift Tables

### `shifts`
- `id` UUID PK
- `user_id` UUID NOT NULL REFERENCES `users(id)`
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `status` `shift_status` NOT NULL
- `started_at` TIMESTAMPTZ NOT NULL
- `ended_at` TIMESTAMPTZ
- `paused_total_seconds` INTEGER NOT NULL DEFAULT 0
- `current_pause_started_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Rules:
- Only one open shift per seller.
- Shift must belong to current assigned store.

## Draft Sales

### `draft_sales`
- `id` UUID PK
- `seller_id` UUID NOT NULL REFERENCES `users(id)`
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `shift_id` UUID NOT NULL REFERENCES `shifts(id)`
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### `draft_sale_items`
- `id` UUID PK
- `draft_sale_id` UUID NOT NULL REFERENCES `draft_sales(id)`
- `product_id` UUID NOT NULL REFERENCES `products(id)`
- `product_name_snapshot` TEXT NOT NULL
- `sku_snapshot` TEXT NOT NULL
- `base_price` NUMERIC(12,2) NOT NULL
- `final_price` NUMERIC(12,2) NOT NULL
- `discount_type` `discount_type`
- `discount_value` NUMERIC(12,2)
- `quantity` NUMERIC(12,3) NOT NULL
- `line_total` NUMERIC(12,2) NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

## Finalized Sales

### `sales`
- `id` UUID PK
- `seller_id` UUID NOT NULL REFERENCES `users(id)`
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `shift_id` UUID NOT NULL REFERENCES `shifts(id)`
- `payment_method` `payment_method` NOT NULL
- `status` `sale_status` NOT NULL DEFAULT 'completed'
- `subtotal_amount` NUMERIC(12,2) NOT NULL
- `discount_amount` NUMERIC(12,2) NOT NULL DEFAULT 0
- `total_amount` NUMERIC(12,2) NOT NULL
- `deleted_at` TIMESTAMPTZ
- `deleted_by` UUID REFERENCES `users(id)`
- `deletion_reason` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Rules:
- Keep deleted sales for audit instead of hard delete.

### `sale_items`
- `id` UUID PK
- `sale_id` UUID NOT NULL REFERENCES `sales(id)`
- `product_id` UUID NOT NULL REFERENCES `products(id)`
- `product_name_snapshot` TEXT NOT NULL
- `sku_snapshot` TEXT NOT NULL
- `base_price` NUMERIC(12,2) NOT NULL
- `final_price` NUMERIC(12,2) NOT NULL
- `discount_type` `discount_type`
- `discount_value` NUMERIC(12,2)
- `quantity` NUMERIC(12,3) NOT NULL
- `line_total` NUMERIC(12,2) NOT NULL

## Returns

### `returns`
- `id` UUID PK
- `sale_id` UUID NOT NULL REFERENCES `sales(id)`
- `seller_id` UUID NOT NULL REFERENCES `users(id)`
- `store_id` UUID NOT NULL REFERENCES `stores(id)`
- `shift_id` UUID NOT NULL REFERENCES `shifts(id)`
- `reason` TEXT NOT NULL
- `total_amount` NUMERIC(12,2) NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### `return_items`
- `id` UUID PK
- `return_id` UUID NOT NULL REFERENCES `returns(id)`
- `sale_item_id` UUID REFERENCES `sale_items(id)`
- `product_id` UUID NOT NULL REFERENCES `products(id)`
- `product_name_snapshot` TEXT NOT NULL
- `sku_snapshot` TEXT NOT NULL
- `returned_price` NUMERIC(12,2) NOT NULL
- `quantity` NUMERIC(12,3) NOT NULL
- `line_total` NUMERIC(12,2) NOT NULL

## Audit Tables

### `impersonation_logs`
- `id` UUID PK
- `admin_user_id` UUID NOT NULL REFERENCES `users(id)`
- `seller_user_id` UUID NOT NULL REFERENCES `users(id)`
- `started_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `ended_at` TIMESTAMPTZ

## Important Constraints
- Unique current assignment per seller in `user_store_assignments`.
- Unique active `store_id, product_id` pair in `store_products`.
- Unique active `store_id, product_id` pair in `inventory`.
- One open shift per seller.
- Seller cannot create or modify records outside current assignment.
- Sale checkout must run in a transaction with inventory movement writes.

## Recommended Backend Rules
- Sale creation should fail if seller has no active shift.
- Sale creation should fail if shift store differs from assignment store.
- Inventory mutation should happen only through one service function.
- Sale deletion should mark sale as `deleted` and write compensating inventory movements.
- Return creation should restore stock through `inventory_movements`.
- Admin impersonation should create and close audit rows.

## Open Decisions
- Replacement flow:
  - simplest option is `return + new sale`
- Sale deletion UX:
  - recommended to soft-delete with reason, not hard-delete
- Inventory after sale deletion:
  - recommended to restore stock automatically using `sale_deletion` movement
