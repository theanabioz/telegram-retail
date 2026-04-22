-- Reporting and hot-path indexes for the self-hosted Postgres runtime.

create index if not exists idx_draft_sales_seller_id
on public.draft_sales (seller_id);

create index if not exists idx_sales_created_at_desc
on public.sales (created_at desc);

create index if not exists idx_sales_store_created_at_desc
on public.sales (store_id, created_at desc);

create index if not exists idx_sales_seller_created_at_desc
on public.sales (seller_id, created_at desc);

create index if not exists idx_returns_created_at_desc
on public.returns (created_at desc);

create index if not exists idx_returns_store_created_at_desc
on public.returns (store_id, created_at desc);

create index if not exists idx_returns_seller_created_at_desc
on public.returns (seller_id, created_at desc);

create index if not exists idx_sale_items_sale_id
on public.sale_items (sale_id);

create index if not exists idx_return_items_return_id
on public.return_items (return_id);
