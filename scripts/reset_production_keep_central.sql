begin;

delete from inventory_movements;
delete from return_items;
delete from returns;
delete from sale_items;
delete from sales;
delete from draft_sale_items;
delete from draft_sales;
delete from impersonation_logs;
delete from shifts;
delete from user_store_assignments;

delete from inventory
where store_id <> '33333333-3333-3333-3333-333333333331';

delete from store_products
where store_id <> '33333333-3333-3333-3333-333333333331';

delete from users;

delete from stores
where id <> '33333333-3333-3333-3333-333333333331';

commit;
