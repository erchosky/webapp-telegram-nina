-- Metadata required by the dashboard's direct, validated media workflow.

alter table public.marketplace_categories
  add column if not exists image_storage_path text,
  add column if not exists image_alt_text text;

alter table public.marketplace_categories
  drop constraint if exists marketplace_categories_image_storage_path_check;
alter table public.marketplace_categories
  add constraint marketplace_categories_image_storage_path_check
  check (image_storage_path is null or image_storage_path ~ '^marketplace/categories/[a-f0-9-]+\.(jpg|png|webp)$');

alter table public.marketplace_item_images
  add column if not exists width integer,
  add column if not exists height integer;

alter table public.marketplace_item_images
  drop constraint if exists marketplace_item_images_dimensions_check;
alter table public.marketplace_item_images
  add constraint marketplace_item_images_dimensions_check
  check (
    (width is null and height is null)
    or (width between 32 and 4096 and height between 32 and 4096)
  );

comment on column public.marketplace_categories.image_storage_path is
  'Owned creator-assets path used for safe replacement and cleanup from the CMS.';
comment on column public.marketplace_item_images.width is
  'Validated pixel width recorded by the server upload boundary.';
comment on column public.marketplace_item_images.height is
  'Validated pixel height recorded by the server upload boundary.';
