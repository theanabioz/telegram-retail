-- Demo seed data for local development and early UI work

insert into public.users (id, telegram_id, role, full_name)
values
  ('11111111-1111-1111-1111-111111111111', 100000001, 'admin', 'Main Admin'),
  ('22222222-2222-2222-2222-222222222221', 100000101, 'seller', 'John Seller'),
  ('22222222-2222-2222-2222-222222222222', 100000102, 'seller', 'Anna Seller'),
  ('22222222-2222-2222-2222-222222222223', 100000103, 'seller', 'Mike Seller')
on conflict (telegram_id) do update
set
  role = excluded.role,
  full_name = excluded.full_name,
  is_active = true;

insert into public.stores (id, name, address)
values
  ('33333333-3333-3333-3333-333333333331', 'Central Mall Store', 'Central Mall, Floor 1'),
  ('33333333-3333-3333-3333-333333333332', 'North Point Store', 'North Point Avenue 12'),
  ('33333333-3333-3333-3333-333333333333', 'Riverside Store', 'Riverside Plaza')
on conflict (id) do update
set
  name = excluded.name,
  address = excluded.address,
  is_active = true;

insert into public.products (id, name, sku, default_price)
values
  ('44444444-4444-4444-4444-444444444401', 'Americano Coffee', 'COF-AMER', 3.50),
  ('44444444-4444-4444-4444-444444444402', 'Butter Croissant', 'PAS-CROIS', 2.20),
  ('44444444-4444-4444-4444-444444444403', 'Tuna Sandwich', 'SND-TUNA', 5.90),
  ('44444444-4444-4444-4444-444444444404', 'Fresh Orange Juice', 'JUI-ORNG', 4.00),
  ('44444444-4444-4444-4444-444444444405', 'Cappuccino', 'COF-CAPP', 3.90),
  ('44444444-4444-4444-4444-444444444406', 'Chocolate Muffin', 'PAS-MUFF', 2.80)
on conflict (sku) do update
set
  name = excluded.name,
  default_price = excluded.default_price,
  is_active = true;

update public.user_store_assignments
set
  is_current = false,
  ended_at = coalesce(ended_at, now())
where user_id in (
  '22222222-2222-2222-2222-222222222221',
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222223'
)
  and is_current = true;

insert into public.user_store_assignments (
  id,
  user_id,
  store_id,
  assigned_by,
  started_at,
  ended_at,
  is_current
)
values
  (
    '55555555-5555-5555-5555-555555555551',
    '22222222-2222-2222-2222-222222222221',
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    now(),
    null,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    now(),
    null,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555553',
    '22222222-2222-2222-2222-222222222223',
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    now(),
    null,
    true
  )
on conflict (id) do update
set
  store_id = excluded.store_id,
  assigned_by = excluded.assigned_by,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  is_current = excluded.is_current;

insert into public.store_products (store_id, product_id, price, is_enabled)
values
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444401', 3.50, true),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444402', 2.20, true),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444403', 5.90, true),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444404', 4.00, true),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444405', 3.90, true),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444406', 2.80, true),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444401', 3.70, true),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444402', 2.30, true),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444403', 6.10, true),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444404', 4.20, true),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444401', 3.60, true),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444402', 2.25, true),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444403', 6.00, true),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444404', 4.10, true)
on conflict (store_id, product_id) do update
set
  price = excluded.price,
  is_enabled = excluded.is_enabled,
  updated_at = now();

insert into public.inventory (store_id, product_id, quantity)
values
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444401', 100),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444402', 20),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444403', 10),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444404', 30),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444405', 40),
  ('33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444406', 18),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444401', 80),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444402', 16),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444403', 12),
  ('33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444404', 22),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444401', 95),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444402', 28),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444403', 15),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444404', 26)
on conflict (store_id, product_id) do update
set
  quantity = excluded.quantity,
  updated_at = now();

insert into public.inventory_movements (
  store_id,
  product_id,
  movement_type,
  quantity_delta,
  balance_after,
  reason,
  actor_user_id
)
select
  i.store_id,
  i.product_id,
  'restock',
  i.quantity,
  i.quantity,
  'Initial seed stock',
  '11111111-1111-1111-1111-111111111111'
from public.inventory i
where not exists (
  select 1
  from public.inventory_movements im
  where im.store_id = i.store_id
    and im.product_id = i.product_id
    and im.reason = 'Initial seed stock'
);
