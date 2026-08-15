-- Cover foreign keys used by joins, deletes and supplier/order lookups.
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS offers_category_id_idx ON public.offers(category_id);
CREATE INDEX IF NOT EXISTS offers_product_id_idx ON public.offers(product_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS order_items_variant_id_idx ON public.order_items(variant_id);
CREATE INDEX IF NOT EXISTS orders_offer_id_idx ON public.orders(offer_id);
CREATE INDEX IF NOT EXISTS product_sync_logs_supplier_id_idx ON public.product_sync_logs(supplier_id);
CREATE INDEX IF NOT EXISTS products_supplier_id_idx ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_orders_supplier_id_idx ON public.supplier_orders(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_sync_logs_supplier_id_idx ON public.supplier_sync_logs(supplier_id);
