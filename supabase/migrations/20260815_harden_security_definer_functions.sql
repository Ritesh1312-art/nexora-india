-- Harden SECURITY DEFINER functions: pin the search_path and prevent direct client RPC execution.
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_order_number() SET search_path = public, pg_catalog;
ALTER FUNCTION public.validate_electrical_product() SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_stock_after_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_supplier_orders_after_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_offer_usage_on_verified_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_offer(uuid, uuid, numeric, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_order_stock(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_order_stock_after_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_supplier_orders_after_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_offer_usage_on_verified_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_offer(uuid, uuid, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
