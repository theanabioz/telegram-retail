alter table public.products
  add column archived_at timestamptz;

create index products_archived_at_idx
  on public.products (archived_at);
