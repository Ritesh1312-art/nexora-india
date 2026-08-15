-- Offer usage is committed only when customer payment is verified.
-- The old redeem_offer implementation incremented usage during validation,
-- which could consume coupons even when payment was rejected.

CREATE OR REPLACE FUNCTION public.record_offer_usage_on_verified_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE target_id uuid;
BEGIN
  IF new.payment_status='VERIFIED'
     AND old.payment_status IS DISTINCT FROM 'VERIFIED'
     AND new.offer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.offer_usage
      WHERE offer_id=new.offer_id AND order_id=new.id
    ) THEN
      INSERT INTO public.offer_usage(offer_id,user_id,order_id,discount_amount)
      VALUES(new.offer_id,new.user_id,new.id,coalesce(new.discount_amount,0));

      UPDATE public.offers
      SET used_count=used_count+1,updated_at=now()
      WHERE id=new.offer_id;

      SELECT id INTO target_id
      FROM public.offer_targets
      WHERE offer_id=new.offer_id AND user_id=new.user_id
      LIMIT 1;

      IF target_id IS NOT NULL THEN
        UPDATE public.offer_targets
        SET used_count=used_count+1
        WHERE id=target_id;
      END IF;
    END IF;
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_offer(
  p_offer_id uuid,
  p_user_id uuid,
  p_subtotal numeric,
  p_total_quantity integer
)
RETURNS TABLE(discount_amount numeric, offer_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  o public.offers%rowtype;
  target public.offer_targets%rowtype;
  d numeric;
BEGIN
  SELECT * INTO o
  FROM public.offers
  WHERE id=p_offer_id AND active=true AND admin_approved=true
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Offer is not active'; END IF;
  IF o.starts_at IS NOT NULL AND now()<o.starts_at THEN RAISE EXCEPTION 'Offer has not started'; END IF;
  IF o.ends_at IS NOT NULL AND now()>o.ends_at THEN RAISE EXCEPTION 'Offer has expired'; END IF;
  IF o.min_order_amount IS NOT NULL AND p_subtotal<o.min_order_amount THEN RAISE EXCEPTION 'Minimum order amount not met'; END IF;
  IF o.min_quantity IS NOT NULL AND p_total_quantity<o.min_quantity THEN RAISE EXCEPTION 'Minimum quantity not met'; END IF;
  IF o.max_uses IS NOT NULL AND o.used_count>=o.max_uses THEN RAISE EXCEPTION 'Offer usage limit reached'; END IF;

  IF upper(o.target_type::text)='SELECTED_USERS' THEN
    SELECT * INTO target
    FROM public.offer_targets
    WHERE offer_id=o.id AND user_id=p_user_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer is not available for this user'; END IF;
    IF o.max_uses_per_user IS NOT NULL AND target.used_count>=o.max_uses_per_user THEN
      RAISE EXCEPTION 'Per-user offer usage limit reached';
    END IF;
  END IF;

  IF upper(o.offer_type::text)='FIXED' THEN
    d=coalesce(o.discount_amount,0);
  ELSE
    d=round(p_subtotal*coalesce(o.discount_percent,0)/100,2);
  END IF;
  IF o.max_discount_amount IS NOT NULL THEN d=least(d,o.max_discount_amount); END IF;
  d=greatest(0,least(d,p_subtotal));

  RETURN QUERY SELECT d,o.code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_offer_usage_on_verified_payment() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_offer(uuid,uuid,numeric,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_offer_usage_on_verified_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_offer(uuid,uuid,numeric,integer) TO service_role;
