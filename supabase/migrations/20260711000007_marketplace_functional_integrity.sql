-- Marketplace functional-integrity additions.
-- Category media and visible item conditions are managed by the CMS. Interest
-- rows snapshot the category so later item edits cannot rewrite their history.

alter table public.marketplace_categories
  add column if not exists image_url text;

alter table public.marketplace_categories
  drop constraint if exists marketplace_categories_image_url_check;
alter table public.marketplace_categories
  add constraint marketplace_categories_image_url_check
  check (image_url is null or image_url ~* '^https?://');

alter table public.marketplace_items
  add column if not exists visible_terms text;

alter table public.purchase_interests
  add column if not exists category_id uuid
  references public.marketplace_categories (id) on delete set null;

update public.purchase_interests interest
set category_id = item.category_id
from public.marketplace_items item
where interest.item_id = item.id
  and interest.category_id is null;

create index if not exists purchase_interests_category_idx
  on public.purchase_interests (category_id, created_at desc);

comment on column public.marketplace_categories.image_url is
  'Optional public category image managed by the WebApp CMS.';
comment on column public.marketplace_items.visible_terms is
  'Conditions or additional information shown in the public item detail.';
comment on column public.purchase_interests.category_id is
  'Category snapshot at request time; preserves history if the item is moved later.';
