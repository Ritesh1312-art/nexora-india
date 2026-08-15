-- Remove inherited PUBLIC EXECUTE privileges from privileged SECURITY DEFINER RPCs.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_order_stock_after_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_supplier_orders_after_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_offer_usage_on_verified_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_offer(uuid, uuid, numeric, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_order_stock(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_order_stock_after_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_supplier_orders_after_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_offer_usage_on_verified_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_offer(uuid, uuid, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
