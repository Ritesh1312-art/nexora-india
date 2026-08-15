-- Audit payment/order status transitions without exposing payment secrets.
CREATE OR REPLACE FUNCTION public.audit_order_security_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF old.payment_status IS DISTINCT FROM new.payment_status
     OR old.order_status IS DISTINCT FROM new.order_status THEN
    INSERT INTO public.activity_logs(
      actor_type,actor_id,action,entity_type,entity_id,metadata
    ) VALUES(
      'SYSTEM',NULL,'ORDER_STATUS_CHANGED','ORDER',new.id::text,
      jsonb_build_object(
        'payment_status_before',old.payment_status::text,
        'payment_status_after',new.payment_status::text,
        'order_status_before',old.order_status::text,
        'order_status_after',new.order_status::text
      )
    );
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_order_status ON public.orders;
CREATE TRIGGER trg_audit_order_status
AFTER UPDATE OF payment_status,order_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_security_event();

REVOKE EXECUTE ON FUNCTION public.audit_order_security_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.audit_order_security_event() TO service_role;
