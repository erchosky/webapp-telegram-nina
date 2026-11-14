# VIP Guard + MiniApp Architecture

## Decision

VIP Guard is the operational brain. The Telegram MiniApp is the public/commercial
surface.

Keep two repos:

- VIP Guard / Bot: Telegram operations, admin dashboard, access lifecycle.
- Telegram MiniApp: customer-facing WebApp and MiniApp content dashboard.

They may share a database or use internal APIs, but only one system can own each
sensitive action. The MiniApp must not become a second VIP Guard dashboard.

## Dashboard Boundaries

VIP Guard dashboard owns critical operations:

- VIP users and access state.
- subscriptions, starts/ends dates, renewals and cancellations.
- manual payment validation and payment evidence.
- referral attribution and rewards.
- invite link creation/revocation.
- expulsions and Telegram group operations.
- Telegram logs, incidents and admin audit for operations.

MiniApp dashboard owns visible/commercial content:

- WebApp texts, home blocks and CTAs.
- banners, images, trailers and featured content.
- marketplace categories, products, order and visibility.
- physical/used product states.
- custom video offers.
- commercial messages and prepared copy.
- read-only metrics from VIP Guard.

MiniApp dashboard may show summaries such as active VIP users, expirations soon,
pending access requests, product interests and clicks. Any sensitive action must
link to VIP Guard, for example "Ir a Dashboard VIP Guard" or the specific VIP
Guard user/subscription page.

## Forbidden In MiniApp Dashboard

- activate, cancel or renew subscriptions.
- validate payments.
- create or revoke invite links.
- expel users.
- change VIP dates or access status.
- edit referrals.
- write Telegram operational logs.
- expose service role or private keys in frontend code.

## Allowed In MiniApp Dashboard

- create/edit/archive products.
- upload/change images and trailers through server-side actions.
- edit descriptions, visible prices, categories and sort order.
- set product status: `available`, `reserved`, `sold`, `hidden`, `archived`.
- mark sold products visible for 24h/48h through `sold_visibility_until`.
- duplicate a sold product into a new draft.
- edit WebApp texts, banners, home sections and CTAs.
- review interest requests and commercial metrics.

## Public MiniApp Reads

The public MiniApp can read only published/visible content through server-side
API routes:

- marketplace items with `status in ('available', 'reserved')`.
- sold items only while `sold_visibility_until > now()`.
- published categories and public WebApp settings.

Marketplace visibility is independent from VIP subscription status. Users
without VIP, pending users, active users, expired users and blocked users can see
the marketplace unless a future explicit policy hides it from blocked users.

## Data Model

Fresh Supabase migration order:

- `supabase/migrations/20260626000001_core_schema.sql`
- `supabase/migrations/20260626000002_payment_intents.sql`
- `supabase/migrations/20260626000003_runtime_hardening.sql`
- `supabase/migrations/20260626000004_webapp_marketplace.sql`
- `supabase/migrations/20260626000005_seed_or_config.sql`

Canonical WebApp tables:

- `creators`
- `webapp_settings`
- `vip_plans`
- `marketplace_categories`
- `marketplace_items`
- `marketplace_item_images`
- `purchase_interests`

Product fields include:

- `status`
- `sold_at`
- `sold_visibility_until`
- `is_featured`
- `sort_order`
- `category_id`
- `price`
- `currency`
- `price_label`
- `public_visible`
- `kind`
- `delivery_type`
- `requires_active_access`
- `cta_label`
- `contact_intent`
- `title`
- `description`
- `internal_notes`

Images are separated into `marketplace_item_images` so products can have
multiple public Supabase Storage images without changing product rows.

## Security Model

- MiniApp dashboard requires admin authentication before any server action.
- Admin reads/writes use server-side routes/actions only.
- Service role remains server-only.
- RLS stays closed to `anon` and `authenticated`.
- Public reads are filtered server-side before returning DTOs.
- Content mutations should be performed server-side by the WebApp dashboard.

## Responsibility Matrix

| Table / module | Writes | Reads | Edits | Type | Owner |
| --- | --- | --- | --- | --- | --- |
| `users` / `telegram_users` | VIP Guard | VIP Guard, MiniApp read-only DTOs | VIP Guard | Critical | VIP Guard |
| `subscriptions` | VIP Guard | VIP Guard, MiniApp read-only status | VIP Guard | Critical | VIP Guard |
| `invite_links` | VIP Guard | VIP Guard, MiniApp read-only current link | VIP Guard | Critical | VIP Guard |
| `payments` / manual payments | VIP Guard | VIP Guard, MiniApp read-only summary if needed | VIP Guard | Critical | VIP Guard |
| `payment_intents` | MiniApp creates request, VIP Guard resolves | Both | VIP Guard resolves; MiniApp may create only `requested` | Critical queue | VIP Guard operational, MiniApp request source |
| `referrals` | VIP Guard | VIP Guard, MiniApp read-only if feature enabled | VIP Guard | Critical | VIP Guard |
| `telegram_logs` | VIP Guard / bot | VIP Guard, MiniApp metrics only if exposed | VIP Guard | Critical | VIP Guard |
| `webapp_settings` | WebApp dashboard | MiniApp public API, WebApp dashboard | WebApp dashboard | Content/config | MiniApp |
| `vip_plans` | WebApp dashboard | MiniApp public API, WebApp dashboard | WebApp dashboard | Commercial plans | MiniApp |
| `marketplace_categories` | MiniApp dashboard | MiniApp public API, MiniApp dashboard | MiniApp dashboard | Content | MiniApp |
| `marketplace_items` | MiniApp dashboard | MiniApp public API, MiniApp dashboard | MiniApp dashboard | Commercial content | MiniApp |
| `marketplace_item_images` | MiniApp dashboard | MiniApp public API, MiniApp dashboard | MiniApp dashboard | Commercial images | MiniApp |
| `purchase_interests` | MiniApp public/API creates, MiniApp dashboard reviews | MiniApp dashboard, metrics | MiniApp dashboard commercial status only | Commercial queue | MiniApp |

## Integration Contract

VIP Guard exposes critical data to MiniApp as read-only DTOs or views:

- effective subscription status.
- active VIP count.
- users expiring in 48h / 7 days.
- pending payment/access requests.
- optional deep links to VIP Guard admin pages.

MiniApp exposes commercial data to its public WebApp:

- published texts/settings/home sections.
- active banners.
- marketplace categories and visible products.
- interest request creation.

If shared database access is used, writes are still separated by table
ownership. If internal APIs are used, the API must enforce the same ownership
rules.

## Product Sold Flow

1. MiniApp admin marks product `sold`.
2. Server sets `sold_at = now()`.
3. Server sets `sold_visibility_until = sold_at + interval '24 hours'` or
   `48 hours`, depending on admin selection.
4. Public MiniApp shows it as "Vendido" until that timestamp.
5. After the window, public API excludes it.
6. Admin may archive it manually or duplicate it into a new draft/product.

No sold product action affects VIP subscription status, payments or Telegram
membership.
