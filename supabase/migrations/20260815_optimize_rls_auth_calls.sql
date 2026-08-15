-- Evaluate auth.uid() once per statement instead of once per row in RLS policies.
ALTER POLICY profiles_own_read ON public.profiles USING ((select auth.uid()) = id);
ALTER POLICY profiles_own_update ON public.profiles USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

ALTER POLICY addresses_own_read ON public.addresses USING ((select auth.uid()) = user_id);
ALTER POLICY addresses_own_insert ON public.addresses WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY addresses_own_update ON public.addresses USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY addresses_own_delete ON public.addresses USING ((select auth.uid()) = user_id);

ALTER POLICY offer_targets_own_read ON public.offer_targets USING (user_id = (select auth.uid()));
ALTER POLICY orders_own_read ON public.orders USING ((select auth.uid()) = user_id);
ALTER POLICY order_items_own_read ON public.order_items USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = (select auth.uid())));
ALTER POLICY order_history_own_read ON public.order_status_history USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id AND o.user_id = (select auth.uid())));
ALTER POLICY payment_records_own_read ON public.payment_records USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payment_records.order_id AND o.user_id = (select auth.uid())));

ALTER POLICY notifications_own_read ON public.notifications USING ((select auth.uid()) = user_id);
ALTER POLICY notifications_own_update ON public.notifications USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY offers_visible_to_users ON public.offers USING (
  active = true
  AND admin_approved = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at >= now())
  AND (
    target_type = 'ALL'::offer_target_type
    OR (
      target_type = 'SELECTED_USERS'::offer_target_type
      AND EXISTS (
        SELECT 1 FROM public.offer_targets ot
        WHERE ot.offer_id = offers.id
          AND ot.user_id = (select auth.uid())
      )
    )
  )
);
