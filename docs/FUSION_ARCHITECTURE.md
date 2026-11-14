# FUSION Architecture

FUSION is a modular monolith:

- `/`: public Telegram MiniApp.
- `/admin`: admin space selector.
- `/admin/vip-guard`: operational VIP Guard dashboard boundary.
- `/admin/webapp`: commercial MiniApp/WebApp CMS for public content, marketplace and interests.

VIP Guard remains the operational brain for Telegram users, subscriptions, invites,
manual payments, expulsions and bot operations. WebApp/MiniApp owns public content,
marketplace products and purchase interests.

Automatic payments and Stripe remain disabled unless their explicit feature flags
are enabled and server-side verification is implemented.

## Canonical Tables

The WebApp runtime uses these canonical tables:

- `creators`
- `webapp_settings`
- `vip_plans`
- `marketplace_categories`
- `marketplace_items`
- `marketplace_item_images`
- `purchase_interests`

Do not create parallel tables such as `miniapp_settings`, `miniapp_texts`,
`product_interest_requests` or `marketplace_media` for new runtime work.
Fresh installs do not create those legacy tables.

## Production Requirements

Apply these migrations before production:

- `supabase/migrations/20260626000001_core_schema.sql`
- `supabase/migrations/20260626000002_payment_intents.sql`
- `supabase/migrations/20260626000003_runtime_hardening.sql`
- `supabase/migrations/20260626000004_webapp_marketplace.sql`
- `supabase/migrations/20260626000005_seed_or_config.sql`
- `supabase/migrations/20260710000006_execution_leases.sql`
- `supabase/migrations/20260711000007_marketplace_functional_integrity.sql`
- `supabase/migrations/20260711000008_admin_media_usability.sql`

`003_runtime_hardening.sql` is mandatory because production rate limiting uses the
Postgres RPC `check_rate_limit`. Development and tests may use in-memory limits;
production must fail clearly if the RPC/table is missing.
`004_webapp_marketplace.sql` owns the canonical WebApp schema.
`005_seed_or_config.sql` is now safe bootstrap content, not a runtime
schema patch.
`006_execution_leases.sql` provides webhook/cron concurrency leases.
`007_marketplace_functional_integrity.sql` adds category media, visible item
conditions and immutable category context on interests.
`008_admin_media_usability.sql` records CMS-owned Storage paths and validated
image dimensions for direct upload, replacement and safe cleanup.

## Marketplace Visibility

- `available`: public when `public_visible=true`.
- `reserved`: public when `public_visible=true`.
- `sold`: public only while `sold_visibility_until` is in the future.
- `hidden`: never public.
- `archived`: never public.

Admin pages can list and edit all statuses.

Images should use Supabase Storage bucket `creator-assets` through
`marketplace_item_images`. This bucket is for public marketplace media only; do
not store premium/private content there.

## Access Gating

The MiniApp may hide or visually block products with `requires_active_access=true`
on the client, but that is not a security boundary. Any future endpoint that
delivers private files, media or premium content must validate the user's active
subscription server-side before returning content.

At this stage, normal marketplace products are public catalogue entries and
purchase interests are manual requests. They do not grant VIP access.

## CSP

The current CSP keeps `unsafe-inline` for scripts/styles because Next.js,
Telegram WebApp SDK bootstrapping and the current Tailwind runtime path still
need it. Treat this as conscious debt: remove it only after verifying Telegram
WebApp launch, theme application and production styling without inline runtime
requirements.
