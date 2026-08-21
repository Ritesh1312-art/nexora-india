-- ============================================================
-- 20260821_category_hierarchy.sql
-- Category → Sub-category structure for Nexora-India:
--   1. Clothes                → Men / Women / Kids
--   2. Footwear               → Men / Women / Kids
--   3. Daily Use Products     → Daily Use / Kitchen Appliances
--   4. Artificial Jewellery
--   5. Electrical Appliances
-- Idempotent: safe to run multiple times. Non-destructive: no
-- products are touched; Kitchen Appliances row (and its linked
-- products) is only re-parented under Daily Use Products.
-- ============================================================

-- Older databases may carry a UNIQUE constraint on categories.name.
-- Sub-categories legitimately repeat names under different parents
-- ('Men' under Clothes AND Footwear), and every lookup in the app is
-- by slug/id, so the name-level uniqueness must go. Slug stays unique.
alter table public.categories drop constraint if exists categories_name_key;

alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete set null;
create index if not exists categories_parent_id_idx on public.categories(parent_id);

-- A. New top-level category: Clothes (position 1)
insert into public.categories (name, slug, description, active, sort_order, category_type, image_url, icon_url, banner_url)
values ('Clothes','clothes','Clothing for men, women and kids — everyday essentials, festive picks and fashion styles.', true, 1, 'OWN',
 '/images/categories/clothes-banner.jpg','/images/categories/clothes-icon.jpg','/images/categories/clothes-banner.jpg')
on conflict (slug) do update set name=excluded.name, description=excluded.description, active=true,
 image_url=excluded.image_url, icon_url=excluded.icon_url, banner_url=excluded.banner_url, sort_order=1;

-- B. Top-level order: Clothes 1, Footwear 2, Daily Use 3, Jewellery 4, Electrical 5
update public.categories set sort_order=2 where slug='footwear';
update public.categories set sort_order=3 where slug='daily-use-products';
update public.categories set sort_order=4 where slug='artificial-jewellery';
update public.categories set sort_order=5 where slug='electrical-appliances';

-- C. Sub-categories (banner/icon inherited from the parent so pages never look broken)
insert into public.categories (name, slug, parent_id, description, active, sort_order, category_type, image_url, icon_url, banner_url)
select v.name, v.slug, p.id, v.description, true, v.ord, 'OWN', p.image_url, p.icon_url, p.banner_url
from (values
  ('Men','clothes-men','clothes','Clothing for men — everyday and festive styles.',1),
  ('Women','clothes-women','clothes','Clothing for women — everyday and festive styles.',2),
  ('Kids','clothes-kids','clothes','Clothing for kids — comfy daily styles.',3),
  ('Men','footwear-men','footwear','Footwear for men — shoes, sneakers, sandals and more.',1),
  ('Women','footwear-women','footwear','Footwear for women — heels, flats, sandals and more.',2),
  ('Kids','footwear-kids','footwear','Footwear for kids — school, sports and casual.',3),
  ('Daily Use','daily-use','daily-use-products','Household essentials, cleaning supplies and daily needs.',1)
) as v(name,slug,parent_slug,description,ord)
join public.categories p on p.slug=v.parent_slug
on conflict (slug) do update set name=excluded.name, parent_id=excluded.parent_id, description=excluded.description;

-- D. Kitchen Appliances moves under Daily Use Products (its products stay attached to it)
update public.categories
set parent_id=(select id from public.categories where slug='daily-use-products'), sort_order=2
where slug='kitchen-appliances';
