-- Telegram Retail initial schema
-- Assumption: the application issues JWTs with claims:
--   app_user_id: UUID from public.users.id
--   app_role: admin | seller
-- The backend may still use the Supabase service role for transactional writes.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'seller');
create type public.shift_status as enum ('active', 'paused', 'closed');
create type public.payment_method as enum ('cash', 'card');
create type public.inventory_movement_type as enum (
  'sale',
  'return',
  'manual_adjustment',
  'restock',
  'writeoff',
  'transfer_in',
  'transfer_out',
  'sale_deletion'
);
create type public.discount_type as enum ('amount', 'percent');
create type public.sale_status as enum ('completed', 'deleted');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  role public.user_role not null,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  default_price numeric(12,2) not null check (default_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_store_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  store_id uuid not null references public.stores(id),
  assigned_by uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  constraint user_store_assignments_dates_chk
    check ((is_current = true and ended_at is null) or (is_current = false and ended_at is not null))
);

create unique index user_store_assignments_one_current_idx
  on public.user_store_assignments (user_id)
  where is_current = true;

create table public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  product_id uuid not null references public.products(id),
  price numeric(12,2) not null check (price >= 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, product_id)
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  product_id uuid not null references public.products(id),
  quantity numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (store_id, product_id)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  store_id uuid not null references public.stores(id),
  status public.shift_status not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  paused_total_seconds integer not null default 0 check (paused_total_seconds >= 0),
  current_pause_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_pause_state_chk check (
    (status = 'paused' and current_pause_started_at is not null and ended_at is null)
    or (status = 'active' and ended_at is null)
    or (status = 'closed' and ended_at is not null)
  )
);

create unique index shifts_one_open_per_user_idx
  on public.shifts (user_id)
  where ended_at is null;

create table public.draft_sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id),
  store_id uuid not null references public.stores(id),
  shift_id uuid not null references public.shifts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.draft_sale_items (
  id uuid primary key default gen_random_uuid(),
  draft_sale_id uuid not null references public.draft_sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  base_price numeric(12,2) not null check (base_price >= 0),
  final_price numeric(12,2) not null check (final_price >= 0),
  discount_type public.discount_type,
  discount_value numeric(12,2) check (discount_value is null or discount_value >= 0),
  quantity numeric(12,3) not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id),
  store_id uuid not null references public.stores(id),
  shift_id uuid not null references public.shifts(id),
  payment_method public.payment_method not null,
  status public.sale_status not null default 'completed',
  subtotal_amount numeric(12,2) not null check (subtotal_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id),
  deletion_reason text,
  created_at timestamptz not null default now(),
  constraint sales_deleted_state_chk check (
    (status = 'completed' and deleted_at is null and deleted_by is null and deletion_reason is null)
    or (status = 'deleted' and deleted_at is not null and deleted_by is not null and deletion_reason is not null)
  )
);

create index sales_store_created_at_idx on public.sales (store_id, created_at desc);
create index sales_seller_created_at_idx on public.sales (seller_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  base_price numeric(12,2) not null check (base_price >= 0),
  final_price numeric(12,2) not null check (final_price >= 0),
  discount_type public.discount_type,
  discount_value numeric(12,2) check (discount_value is null or discount_value >= 0),
  quantity numeric(12,3) not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  seller_id uuid not null references public.users(id),
  store_id uuid not null references public.stores(id),
  shift_id uuid not null references public.shifts(id),
  reason text not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create index returns_store_created_at_idx on public.returns (store_id, created_at desc);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id),
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  returned_price numeric(12,2) not null check (returned_price >= 0),
  quantity numeric(12,3) not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  product_id uuid not null references public.products(id),
  movement_type public.inventory_movement_type not null,
  quantity_delta numeric(12,3) not null,
  balance_after numeric(12,3) not null,
  reason text,
  actor_user_id uuid not null references public.users(id),
  sale_id uuid references public.sales(id),
  return_id uuid references public.returns(id),
  shift_id uuid references public.shifts(id),
  created_at timestamptz not null default now(),
  constraint inventory_movements_reference_chk check (
    sale_id is not null
    or return_id is not null
    or shift_id is not null
    or reason is not null
  )
);

create index inventory_movements_store_created_at_idx
  on public.inventory_movements (store_id, created_at desc);

create index inventory_movements_product_created_at_idx
  on public.inventory_movements (product_id, created_at desc);

create table public.impersonation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.users(id),
  seller_user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger set_stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger set_store_products_updated_at
before update on public.store_products
for each row execute function public.set_updated_at();

create trigger set_shifts_updated_at
before update on public.shifts
for each row execute function public.set_updated_at();

create trigger set_draft_sales_updated_at
before update on public.draft_sales
for each row execute function public.set_updated_at();

create trigger set_draft_sale_items_updated_at
before update on public.draft_sale_items
for each row execute function public.set_updated_at();

create or replace function public.app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'app_user_id', '')::uuid
$$;

create or replace function public.app_role()
returns public.user_role
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'app_role', '')::public.user_role
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.app_role() = 'admin'
$$;

create or replace function public.current_seller_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select usa.store_id
  from public.user_store_assignments usa
  where usa.user_id = public.app_user_id()
    and usa.is_current = true
  limit 1
$$;

create or replace function public.can_access_store(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.current_seller_store_id() = target_store_id
$$;

create or replace function public.is_self(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select public.app_user_id() = target_user_id
$$;

alter table public.users enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.user_store_assignments enable row level security;
alter table public.store_products enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.shifts enable row level security;
alter table public.draft_sales enable row level security;
alter table public.draft_sale_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.impersonation_logs enable row level security;

create policy "admins full access users"
on public.users
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read self user"
on public.users
for select
using (public.is_self(id));

create policy "admins full access stores"
on public.stores
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store"
on public.stores
for select
using (public.can_access_store(id));

create policy "admins full access assignments"
on public.user_store_assignments
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read own assignments"
on public.user_store_assignments
for select
using (public.is_self(user_id));

create policy "admins full access products"
on public.products
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read enabled products in assigned store"
on public.products
for select
using (
  exists (
    select 1
    from public.store_products sp
    where sp.product_id = products.id
      and sp.store_id = public.current_seller_store_id()
      and sp.is_enabled = true
  )
);

create policy "admins full access store products"
on public.store_products
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store products"
on public.store_products
for select
using (
  public.can_access_store(store_id)
  and is_enabled = true
);

create policy "admins full access inventory"
on public.inventory
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store inventory"
on public.inventory
for select
using (public.can_access_store(store_id));

create policy "admins full access inventory movements"
on public.inventory_movements
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store inventory movements"
on public.inventory_movements
for select
using (public.can_access_store(store_id));

create policy "admins full access shifts"
on public.shifts
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read own shifts"
on public.shifts
for select
using (public.is_self(user_id));

create policy "seller can manage own shifts in assigned store"
on public.shifts
for insert
with check (
  public.app_role() = 'seller'
  and public.is_self(user_id)
  and public.can_access_store(store_id)
);

create policy "seller can update own open shifts"
on public.shifts
for update
using (
  public.app_role() = 'seller'
  and public.is_self(user_id)
  and public.can_access_store(store_id)
)
with check (
  public.app_role() = 'seller'
  and public.is_self(user_id)
  and public.can_access_store(store_id)
);

create policy "admins full access draft sales"
on public.draft_sales
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can manage own draft sales"
on public.draft_sales
for all
using (
  public.app_role() = 'seller'
  and public.is_self(seller_id)
  and public.can_access_store(store_id)
)
with check (
  public.app_role() = 'seller'
  and public.is_self(seller_id)
  and public.can_access_store(store_id)
);

create policy "admins full access draft sale items"
on public.draft_sale_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can manage own draft sale items"
on public.draft_sale_items
for all
using (
  exists (
    select 1
    from public.draft_sales ds
    where ds.id = draft_sale_items.draft_sale_id
      and ds.seller_id = public.app_user_id()
      and public.can_access_store(ds.store_id)
  )
)
with check (
  exists (
    select 1
    from public.draft_sales ds
    where ds.id = draft_sale_items.draft_sale_id
      and ds.seller_id = public.app_user_id()
      and public.can_access_store(ds.store_id)
  )
);

create policy "admins full access sales"
on public.sales
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store sales"
on public.sales
for select
using (public.can_access_store(store_id));

create policy "seller can create own sales in assigned store"
on public.sales
for insert
with check (
  public.app_role() = 'seller'
  and public.is_self(seller_id)
  and public.can_access_store(store_id)
);

create policy "seller can mark own sales as deleted"
on public.sales
for update
using (
  public.app_role() = 'seller'
  and public.can_access_store(store_id)
  and public.is_self(seller_id)
)
with check (
  public.app_role() = 'seller'
  and public.can_access_store(store_id)
  and public.is_self(seller_id)
);

create policy "admins full access sale items"
on public.sale_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store sale items"
on public.sale_items
for select
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and public.can_access_store(s.store_id)
  )
);

create policy "seller can insert own sale items"
on public.sale_items
for insert
with check (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and s.seller_id = public.app_user_id()
      and public.can_access_store(s.store_id)
  )
);

create policy "admins full access returns"
on public.returns
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store returns"
on public.returns
for select
using (public.can_access_store(store_id));

create policy "seller can create own returns in assigned store"
on public.returns
for insert
with check (
  public.app_role() = 'seller'
  and public.is_self(seller_id)
  and public.can_access_store(store_id)
);

create policy "admins full access return items"
on public.return_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "seller can read assigned store return items"
on public.return_items
for select
using (
  exists (
    select 1
    from public.returns r
    where r.id = return_items.return_id
      and public.can_access_store(r.store_id)
  )
);

create policy "seller can insert own return items"
on public.return_items
for insert
with check (
  exists (
    select 1
    from public.returns r
    where r.id = return_items.return_id
      and r.seller_id = public.app_user_id()
      and public.can_access_store(r.store_id)
  )
);

create policy "admins full access impersonation logs"
on public.impersonation_logs
for all
using (public.is_admin())
with check (public.is_admin());
