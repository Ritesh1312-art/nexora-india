-- Nexora-India: targeted offers
-- Run this once in Supabase SQL Editor before creating SELECTED_USERS offers.
-- jsonb is used because a selected offer can contain one or many user IDs.

alter table public.offers
  add column if not exists target_user_ids jsonb not null default '[]'::jsonb;

update public.offers
set target_user_ids = '[]'::jsonb
where target_user_ids is null;

comment on column public.offers.target_user_ids is 'Supabase Auth user UUIDs targeted by a SELECTED_USERS offer; empty for ALL/ACTIVE_USERS/INACTIVE_USERS.';
