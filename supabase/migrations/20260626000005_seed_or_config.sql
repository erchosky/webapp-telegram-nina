-- Optional safe bootstrap data for a fresh install.
-- No real creator identity, Telegram group, prices, secrets or private content
-- are stored here. Production admins should replace this copy in the dashboard.

insert into public.webapp_settings (key, value, is_public, description)
values
  (
    'branding',
    '{
      "creatorName": "Creator",
      "marketplaceHeadline": "Privado disponible",
      "marketplaceIntro": "Contenido y piezas bajo consulta. Todo se confirma por privado."
    }'::jsonb,
    true,
    'Public WebApp branding defaults. Replace from /admin/webapp/branding.'
  ),
  (
    'home',
    '{
      "marketplaceEmptyTitle": "No hay nada visible ahora",
      "marketplaceEmptyBody": "Vuelve más tarde o escribe por privado para consultar disponibilidad."
    }'::jsonb,
    true,
    'Public WebApp home copy defaults. Replace from /admin/webapp/home.'
  ),
  (
    'marketplace',
    '{}'::jsonb,
    true,
    'Public marketplace display options.'
  )
on conflict (key)
do update set
  value = excluded.value,
  is_public = excluded.is_public,
  description = excluded.description,
  updated_at = now();

insert into public.marketplace_categories (slug, title, description, status, sort_order)
values
  ('online-content', 'Contenido online', 'Packs, videos o contenido privado bajo consulta.', 'hidden', 10),
  ('custom', 'Personalizados', 'Solicitudes a medida con confirmacion previa.', 'hidden', 20),
  ('pieces', 'Piezas bajo consulta', 'Piezas puntuales cuando haya disponibilidad.', 'hidden', 30),
  ('wishlist-gifts', 'Wishlist / regalos', 'Wishlist o regalos disponibles por privado.', 'hidden', 40)
on conflict (slug)
do update set
  title = excluded.title,
  description = excluded.description,
  status = marketplace_categories.status,
  sort_order = excluded.sort_order,
  updated_at = now();

comment on table public.webapp_settings is
  'Canonical settings plus safe bootstrap rows. Do not store secrets here.';
