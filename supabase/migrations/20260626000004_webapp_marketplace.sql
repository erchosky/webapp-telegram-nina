-- WebApp/MiniApp canonical content + marketplace schema.
-- Safe for a fresh Supabase project. This migration intentionally creates only
-- the runtime tables used by the current code; legacy parallel tables from the
-- old MiniApp draft are not created.

do $$
begin
  create type public.webapp_publication_status as enum
    ('draft', 'published', 'hidden', 'archived');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  telegram_username text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webapp_settings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete set null,
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  description text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webapp_settings_key_format_check
    check (key ~ '^[a-z][a-z0-9_]{1,63}$')
);

create table if not exists public.vip_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete set null,
  name text not null,
  description text,
  status text not null default 'published',
  amount numeric(12, 2),
  currency text not null default 'EUR',
  duration_days integer,
  is_featured boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_plans_status_check check (status in ('published', 'hidden', 'archived')),
  constraint vip_plans_amount_check check (amount is null or amount >= 0),
  constraint vip_plans_currency_check check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  constraint vip_plans_duration_days_check check (duration_days is null or duration_days >= 1)
);

create table if not exists public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete set null,
  slug text not null unique,
  title text not null,
  description text,
  status public.webapp_publication_status not null default 'draft',
  sort_order integer not null default 100,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_categories_slug_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.marketplace_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete set null,
  category_id uuid references public.marketplace_categories (id) on delete set null,
  status text not null default 'hidden',
  title text not null,
  description text,
  price numeric(12, 2),
  currency text not null default 'EUR',
  price_label text,
  public_visible boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 100,
  kind text not null default 'physical_piece',
  delivery_type text not null default 'manual',
  requires_active_access boolean not null default false,
  cta_label text not null default 'Me interesa',
  contact_intent text,
  sold_at timestamptz,
  sold_visibility_until timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  internal_notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_items_status_check
    check (status in ('available', 'reserved', 'sold', 'hidden', 'archived')),
  constraint marketplace_items_kind_check
    check (kind in ('online_content', 'custom_request', 'physical_piece', 'wishlist', 'promotion')),
  constraint marketplace_items_delivery_type_check
    check (delivery_type in ('telegram', 'manual', 'external')),
  constraint marketplace_items_price_check check (price is null or price >= 0),
  constraint marketplace_items_currency_check
    check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  constraint marketplace_items_sold_dates_check
    check (
      (status = 'sold' and sold_at is not null)
      or (status <> 'sold' and sold_at is null and sold_visibility_until is null)
    )
);

create table if not exists public.marketplace_item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.marketplace_items (id) on delete cascade,
  storage_path text,
  public_url text,
  alt_text text,
  mime_type text not null default 'image/jpeg',
  file_size_bytes integer,
  is_primary boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_item_images_location_check
    check (storage_path is not null or public_url is not null),
  constraint marketplace_item_images_public_url_check
    check (public_url is null or public_url ~* '^https?://'),
  constraint marketplace_item_images_storage_path_check
    check (storage_path is null or storage_path !~ '(^/|\\.\\.|\\\\)'),
  constraint marketplace_item_images_mime_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint marketplace_item_images_size_check
    check (file_size_bytes is null or file_size_bytes between 1 and 5242880)
);

create table if not exists public.purchase_interests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete set null,
  item_id uuid not null references public.marketplace_items (id) on delete cascade,
  telegram_user_id uuid references public.telegram_users (id) on delete set null,
  telegram_user_numeric_id bigint,
  user_name text,
  telegram_username text,
  message text,
  status text not null default 'requested',
  internal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_interests_status_check
    check (status in ('requested', 'seen', 'in_review', 'resolved', 'cancelled')),
  constraint purchase_interests_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists creators_active_idx
  on public.creators (is_active, created_at desc);
create index if not exists webapp_settings_public_idx
  on public.webapp_settings (is_public, key);
create index if not exists webapp_settings_creator_idx
  on public.webapp_settings (creator_id, key);
create index if not exists vip_plans_public_idx
  on public.vip_plans (status, is_featured, sort_order);
create index if not exists vip_plans_creator_idx
  on public.vip_plans (creator_id, status, sort_order);
create index if not exists marketplace_categories_public_idx
  on public.marketplace_categories (status, sort_order);
create index if not exists marketplace_categories_creator_idx
  on public.marketplace_categories (creator_id, status, sort_order);
create index if not exists marketplace_items_category_idx
  on public.marketplace_items (category_id);
create index if not exists marketplace_items_creator_idx
  on public.marketplace_items (creator_id, status, sort_order);
create index if not exists marketplace_items_status_idx
  on public.marketplace_items (status);
create index if not exists marketplace_items_public_idx
  on public.marketplace_items (public_visible, status, sold_visibility_until, is_featured, sort_order);
create index if not exists marketplace_item_images_item_idx
  on public.marketplace_item_images (item_id, is_primary, sort_order);
create unique index if not exists marketplace_item_images_one_primary_per_item_idx
  on public.marketplace_item_images (item_id)
  where is_primary;
create index if not exists purchase_interests_queue_idx
  on public.purchase_interests (status, created_at desc)
  where status in ('requested', 'seen', 'in_review');
create index if not exists purchase_interests_user_idx
  on public.purchase_interests (telegram_user_id, created_at desc);
create index if not exists purchase_interests_item_idx
  on public.purchase_interests (item_id, created_at desc);
create index if not exists purchase_interests_creator_idx
  on public.purchase_interests (creator_id, status, created_at desc);
create unique index if not exists purchase_interests_one_open_per_user_item_idx
  on public.purchase_interests (telegram_user_id, item_id)
  where telegram_user_id is not null and status in ('requested', 'seen', 'in_review');

drop trigger if exists creators_set_updated_at on public.creators;
create trigger creators_set_updated_at
  before update on public.creators
  for each row execute function public.set_updated_at();

drop trigger if exists webapp_settings_set_updated_at on public.webapp_settings;
create trigger webapp_settings_set_updated_at
  before update on public.webapp_settings
  for each row execute function public.set_updated_at();

drop trigger if exists vip_plans_set_updated_at on public.vip_plans;
create trigger vip_plans_set_updated_at
  before update on public.vip_plans
  for each row execute function public.set_updated_at();

drop trigger if exists marketplace_categories_set_updated_at on public.marketplace_categories;
create trigger marketplace_categories_set_updated_at
  before update on public.marketplace_categories
  for each row execute function public.set_updated_at();

drop trigger if exists marketplace_items_set_updated_at on public.marketplace_items;
create trigger marketplace_items_set_updated_at
  before update on public.marketplace_items
  for each row execute function public.set_updated_at();

drop trigger if exists marketplace_item_images_set_updated_at on public.marketplace_item_images;
create trigger marketplace_item_images_set_updated_at
  before update on public.marketplace_item_images
  for each row execute function public.set_updated_at();

drop trigger if exists purchase_interests_set_updated_at on public.purchase_interests;
create trigger purchase_interests_set_updated_at
  before update on public.purchase_interests
  for each row execute function public.set_updated_at();

alter table public.creators enable row level security;
alter table public.webapp_settings enable row level security;
alter table public.vip_plans enable row level security;
alter table public.marketplace_categories enable row level security;
alter table public.marketplace_items enable row level security;
alter table public.marketplace_item_images enable row level security;
alter table public.purchase_interests enable row level security;

revoke all on table public.creators from anon, authenticated;
revoke all on table public.webapp_settings from anon, authenticated;
revoke all on table public.vip_plans from anon, authenticated;
revoke all on table public.marketplace_categories from anon, authenticated;
revoke all on table public.marketplace_items from anon, authenticated;
revoke all on table public.marketplace_item_images from anon, authenticated;
revoke all on table public.purchase_interests from anon, authenticated;

revoke all on type public.webapp_publication_status from public;
grant usage on type public.webapp_publication_status to service_role;
grant select, insert, update, delete on table public.creators to service_role;
grant select, insert, update, delete on table public.webapp_settings to service_role;
grant select, insert, update, delete on table public.vip_plans to service_role;
grant select, insert, update, delete on table public.marketplace_categories to service_role;
grant select, insert, update, delete on table public.marketplace_items to service_role;
grant select, insert, update, delete on table public.marketplace_item_images to service_role;
grant select, insert, update, delete on table public.purchase_interests to service_role;

comment on table public.creators is
  'Creator scope for future multi-creator support. Current product can run with null creator_id for a single creator.';
comment on table public.webapp_settings is
  'Canonical public WebApp settings for branding, home and marketplace copy. Replaces legacy miniapp_settings/miniapp_texts tables.';
comment on column public.webapp_settings.creator_id is
  'Future creator scope. Settings key remains globally unique while the product runs as a single-creator app.';
comment on table public.vip_plans is
  'Public VIP plan catalogue shown by the WebApp. It does not grant access; VIP Guard/admin validation remains authoritative.';
comment on table public.marketplace_categories is
  'Canonical marketplace categories used by the WebApp runtime and admin dashboard.';
comment on table public.marketplace_items is
  'Canonical marketplace products. VIP Guard must not use this table for subscriptions, invites or Telegram operations.';
comment on column public.marketplace_items.status is
  'available/reserved/sold/hidden/archived. Sold items require sold_at and are public only until sold_visibility_until.';
comment on column public.marketplace_items.sold_visibility_until is
  'Optional public sold badge window. Must be null when status is not sold.';
comment on table public.marketplace_item_images is
  'Canonical public marketplace images from Supabase Storage bucket creator-assets or an http(s) public_url. Replaces legacy marketplace_media.';
comment on index public.marketplace_item_images_one_primary_per_item_idx is
  'DB guarantee that each marketplace item has at most one primary image.';
comment on table public.purchase_interests is
  'Canonical marketplace interest queue. Replaces legacy product_interest_requests and never confirms payment or grants VIP access.';
comment on index public.purchase_interests_one_open_per_user_item_idx is
  'Keeps open marketplace interest requests idempotent per user and item.';
