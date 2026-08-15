-- Prevent the same order from consuming an offer more than once.
CREATE UNIQUE INDEX IF NOT EXISTS offer_usage_order_unique
ON public.offer_usage(order_id)
WHERE order_id IS NOT NULL;
