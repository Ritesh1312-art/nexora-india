-- Database-level invariants for inventory, pricing and order amounts.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_stock_nonnegative CHECK (stock>=0);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_min_order_qty_positive;
ALTER TABLE public.products ADD CONSTRAINT products_min_order_qty_positive CHECK (min_order_qty>=1);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_prices_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_prices_nonnegative CHECK (cost_price>=0 AND selling_price>=0 AND delivery_charge>=0 AND electrical_delivery_charge>=0);

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_discount_percent_valid;
ALTER TABLE public.offers ADD CONSTRAINT offers_discount_percent_valid CHECK (discount_percent IS NULL OR (discount_percent>=0 AND discount_percent<=100));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_amounts_nonnegative;
ALTER TABLE public.orders ADD CONSTRAINT orders_amounts_nonnegative CHECK (subtotal>=0 AND discount_amount>=0 AND shipping_amount>=0 AND total_amount>=0 AND estimated_supplier_cost>=0);
