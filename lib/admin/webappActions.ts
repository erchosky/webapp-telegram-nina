"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotReadOnly } from "@/lib/admin/modes";
import { auditLog } from "@/lib/logs";
import { assertSameOrigin } from "@/lib/security/origin";
import { checkRateLimit, requestIp } from "@/lib/security/rate-limit";
import {
  applySoldStatusFields,
  normalizePublicImageUrl,
  parseSettingJson,
  shouldMarkImagePrimary,
  type MarketplaceItemPayload,
} from "@/lib/admin/webappActionUtils";
import {
  isOwnedImagePath,
  removeOwnedImage,
  storagePathFromPublicUrl,
  uploadValidatedImage,
  validateImageFile,
} from "@/lib/admin/imageUpload";

const mutableTables = new Set(["marketplace_categories", "marketplace_items", "vip_plans"]);
const categoryStatuses = new Set(["draft", "published", "hidden", "archived"]);
const itemStatuses = new Set(["available", "reserved", "sold", "hidden", "archived"]);
const itemKinds = new Set(["online_content", "custom_request", "physical_piece", "wishlist", "promotion"]);
const deliveryTypes = new Set(["telegram", "manual", "external"]);
const planStatuses = new Set(["published", "hidden", "archived"]);
const interestStatuses = new Set(["requested", "seen", "in_review", "resolved", "cancelled"]);

async function protectWebappMutation() {
  await assertSameOrigin();
  await requireAdmin();
  const incoming = await headers();
  if (!(await checkRateLimit(`admin-webapp-action:${requestIp(incoming)}`, 60, 60_000)).allowed) {
    throw new Error("Demasiadas acciones. Espera un minuto.");
  }
  await assertNotReadOnly();
}

function dbError(error: { message?: string } | null | undefined, fallback = "No se pudo guardar el cambio.") {
  return new Error(error?.message || fallback);
}

export async function saveCategory(formData: FormData) {
  await protectWebappMutation();
  const id = stringOrNull(formData.get("id"));
  const db = createAdminClient();
  const existing = id
    ? await db.from("marketplace_categories").select("slug, title, description, image_url, image_storage_path, image_alt_text, status, sort_order, updated_at").eq("id", id).maybeSingle()
    : { data: null, error: null };
  if (existing.error) throw dbError(existing.error, "No se pudo cargar la imagen actual.");
  const image = await validateImageFile(formData.get("image_file"));
  const uploaded = image ? await uploadValidatedImage(db, "categories", image) : null;
  const removeImage = formData.get("remove_image") === "on";
  const previousPath = typeof existing.data?.image_storage_path === "string" ? existing.data.image_storage_path : null;
  const payload = {
    slug: slugValue(required(formData, "slug")),
    title: limitedRequired(formData, "title", 120),
    description: limitedOptional(formData.get("description"), 1_000, "descripción"),
    image_url: uploaded?.publicUrl ?? (removeImage ? null : normalizePublicImageUrl(stringOrNull(formData.get("image_url"))) ?? existing.data?.image_url ?? null),
    image_storage_path: uploaded?.storagePath ?? (removeImage ? null : previousPath),
    image_alt_text: limitedOptional(formData.get("image_alt_text"), 180, "texto alternativo"),
    status: enumValue(formData.get("status"), categoryStatuses, "published", "estado de categoría"),
    sort_order: numberOrDefault(formData.get("sort_order"), 100),
  };
  let rowId: string | null;
  try {
    rowId = await upsert("marketplace_categories", id, payload);
  } catch (error) {
    if (uploaded) await removeOwnedImage(db, uploaded.storagePath).catch(() => undefined);
    throw error;
  }
  if ((uploaded || removeImage) && previousPath && previousPath !== uploaded?.storagePath) await removeOwnedImage(db, previousPath).catch(() => false);
  await auditLog(id ? "webapp_category_updated" : "webapp_category_created", id ? "Categoría WebApp actualizada" : "Categoría WebApp creada", undefined, {
    module: "webapp",
    table: "marketplace_categories",
    id: rowId ?? id,
    slug: payload.slug,
    status: payload.status,
    before: existing.data,
    after: payload,
  });
  revalidatePath("/admin/webapp/categories");
  revalidatePath("/api/marketplace");
}

export async function saveItem(formData: FormData) {
  await protectWebappMutation();
  const id = stringOrNull(formData.get("id"));
  const db = createAdminClient();
  const existingRow = id
    ? await db.from("marketplace_items").select("category_id, title, description, visible_terms, price, currency, price_label, status, public_visible, is_featured, sort_order, sold_at, sold_visibility_until, requires_active_access, cta_label, contact_intent, kind, delivery_type, updated_at").eq("id", id).maybeSingle()
    : { data: null, error: null };
  if (existingRow.error) throw dbError(existingRow.error, "No se pudo cargar el producto actual.");
  const status = enumValue(formData.get("status"), itemStatuses, "available", "estado de producto");
  const payload: MarketplaceItemPayload = {
    category_id: stringOrNull(formData.get("category_id")),
    title: limitedRequired(formData, "title", 160),
    description: limitedOptional(formData.get("description"), 2_000, "descripción"),
    visible_terms: limitedOptional(formData.get("visible_terms"), 2_000, "condiciones"),
    price: numberOrNull(formData.get("price")),
    currency: currencyValue(formData.get("currency")),
    price_label: limitedOptional(formData.get("price_label"), 80, "texto de precio"),
    status,
    public_visible: formData.get("public_visible") === "on",
    is_featured: formData.get("is_featured") === "on",
    sort_order: numberOrDefault(formData.get("sort_order"), 100),
    sold_visibility_until: dateValue(formData.get("sold_visibility_until"), "visibilidad de vendido"),
    requires_active_access: formData.get("requires_active_access") === "on",
    cta_label: limitedOptional(formData.get("cta_label"), 80, "CTA") ?? "Me interesa",
    contact_intent: limitedOptional(formData.get("contact_intent"), 300, "intención de contacto"),
    kind: enumValue(formData.get("kind"), itemKinds, "physical_piece", "tipo de producto"),
    delivery_type: enumValue(formData.get("delivery_type"), deliveryTypes, "manual", "entrega"),
  };
  let existingSoldAt: string | null = null;
  if (id && status === "sold") existingSoldAt = typeof existingRow.data?.sold_at === "string" ? existingRow.data.sold_at : null;
  const savedPayload = applySoldStatusFields(payload, existingSoldAt);
  const rowId = await upsert("marketplace_items", id, savedPayload);
  const image = await validateImageFile(formData.get("image_file"));
  if (image && (rowId ?? id)) {
    await saveUploadedItemImage(db, rowId ?? id!, image, {
      altText: limitedOptional(formData.get("image_alt_text"), 180, "texto alternativo"),
      requestedPrimary: true,
      replacePrimary: true,
    });
  }
  await auditLog(id ? "webapp_item_updated" : "webapp_item_created", id ? "Producto WebApp actualizado" : "Producto WebApp creado", undefined, {
    module: "webapp",
    table: "marketplace_items",
    id: rowId ?? id,
    status: payload.status,
    title: payload.title,
    public_visible: payload.public_visible,
    before: existingRow.data,
    after: savedPayload,
  });
  revalidatePath("/admin/webapp/marketplace");
  revalidatePath("/api/marketplace");
}

export async function saveItemImage(formData: FormData) {
  await protectWebappMutation();
  const db = createAdminClient();
  const itemId = required(formData, "item_id");
  const image = await validateImageFile(formData.get("image_file"));
  if (!image) throw new Error("Selecciona una imagen para subir.");
  const data = await saveUploadedItemImage(db, itemId, image, {
    altText: limitedOptional(formData.get("alt_text"), 180, "texto alternativo"),
    requestedPrimary: formData.get("is_primary") === "on",
    replacePrimary: false,
    sortOrder: numberOrDefault(formData.get("sort_order"), 10),
  });
  await auditLog("webapp_item_image_created", "Imagen de producto WebApp añadida", undefined, {
    module: "webapp",
    table: "marketplace_item_images",
    id: data.id,
    item_id: itemId,
    is_primary: data.isPrimary,
    has_public_url: true,
    has_storage_path: true
  });
  revalidatePath("/admin/webapp/marketplace");
  revalidatePath("/api/marketplace");
}

export async function deleteItemImage(formData: FormData) {
  await protectWebappMutation();
  const db = createAdminClient();
  const itemId = required(formData, "item_id");
  const imageId = required(formData, "image_id");
  const existing = await db
    .from("marketplace_item_images")
    .select("is_primary, storage_path")
    .eq("id", imageId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (existing.error) throw dbError(existing.error, "No se pudo localizar la imagen.");
  const { error } = await db
    .from("marketplace_item_images")
    .delete()
    .eq("id", imageId)
    .eq("item_id", itemId);
  if (error) throw dbError(error, "No se pudo eliminar la imagen.");
  if (typeof existing.data?.storage_path === "string") await removeOwnedImage(db, existing.data.storage_path).catch(() => false);
  if (existing.data?.is_primary === true) {
    const remaining = await db
      .from("marketplace_item_images")
      .select("id")
      .eq("item_id", itemId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (remaining.error) throw dbError(remaining.error, "No se pudo restaurar la imagen principal.");
    if (remaining.data?.id) {
      await db
        .from("marketplace_item_images")
        .update({ is_primary: true })
        .eq("id", remaining.data.id)
        .eq("item_id", itemId)
        .throwOnError();
    }
  }
  await auditLog("webapp_item_image_deleted", "Imagen de producto WebApp eliminada", undefined, {
    module: "webapp",
    table: "marketplace_item_images",
    id: imageId,
    item_id: itemId
  });
  revalidatePath("/admin/webapp/marketplace");
  revalidatePath("/api/marketplace");
}

export async function markItemImagePrimary(formData: FormData) {
  await protectWebappMutation();
  const db = createAdminClient();
  const itemId = required(formData, "item_id");
  const imageId = required(formData, "image_id");
  await db
    .from("marketplace_item_images")
    .update({ is_primary: false })
    .eq("item_id", itemId)
    .throwOnError();
  const { error } = await db
    .from("marketplace_item_images")
    .update({ is_primary: true })
    .eq("id", imageId)
    .eq("item_id", itemId);
  if (error) throw dbError(error, "No se pudo marcar la imagen como principal.");
  await auditLog("webapp_item_image_primary_set", "Imagen principal de producto WebApp actualizada", undefined, {
    module: "webapp",
    table: "marketplace_item_images",
    id: imageId,
    item_id: itemId
  });
  revalidatePath("/admin/webapp/marketplace");
  revalidatePath("/api/marketplace");
}

export async function savePlan(formData: FormData) {
  await protectWebappMutation();
  const id = stringOrNull(formData.get("id"));
  const db = createAdminClient();
  const before = id ? await db.from("vip_plans").select("name, description, status, amount, currency, duration_days, is_featured, sort_order, updated_at").eq("id", id).maybeSingle() : { data: null, error: null };
  if (before.error) throw dbError(before.error, "No se pudo cargar el plan actual.");
  const payload = {
    name: required(formData, "name"),
    description: stringOrNull(formData.get("description")),
    status: enumValue(formData.get("status"), planStatuses, "published", "estado de plan"),
    amount: numberOrNull(formData.get("amount")),
    currency: currencyValue(formData.get("currency")),
    duration_days: numberOrNull(formData.get("duration_days")),
    is_featured: formData.get("is_featured") === "on",
    sort_order: numberOrDefault(formData.get("sort_order"), 100),
  };
  const rowId = await upsert("vip_plans", id, payload);
  await auditLog(id ? "webapp_plan_updated" : "webapp_plan_created", id ? "Plan WebApp actualizado" : "Plan WebApp creado", undefined, {
    module: "webapp",
    table: "vip_plans",
    id: rowId ?? id,
    status: payload.status,
    name: payload.name,
    amount: payload.amount,
    currency: payload.currency,
    duration_days: payload.duration_days,
    before: before.data,
    after: payload,
  });
  revalidatePath("/admin/webapp/plans");
}

export async function saveSetting(formData: FormData) {
  await protectWebappMutation();
  const key = required(formData, "key");
  const payload = {
    key,
    value: parseSettingJson(required(formData, "value")),
    is_public: formData.get("is_public") === "on",
    description: stringOrNull(formData.get("description")),
  };
  const { error } = await createAdminClient()
    .from("webapp_settings")
    .upsert(payload, { onConflict: "key" });
  if (error) throw dbError(error);
  await auditLog("webapp_setting_saved", "Setting WebApp guardado", undefined, {
    module: "webapp",
    table: "webapp_settings",
    key,
    is_public: payload.is_public
  });
  revalidatePath("/admin/webapp/branding");
  revalidatePath("/admin/webapp/home");
  revalidatePath("/api/marketplace");
}

export async function saveMarketplaceSettings(formData: FormData) {
  await protectWebappMutation();
  const db = createAdminClient();
  const existing = await settingValue(db, "marketplace");
  const image = await validateImageFile(formData.get("header_image_file"));
  const uploaded = image ? await uploadValidatedImage(db, "branding", image) : null;
  const removeImage = formData.get("remove_header_image") === "on";
  const previousPath = stringRecordValue(existing, "marketplaceHeaderStoragePath") ?? storagePathFromPublicUrl(existing.marketplaceHeaderImageUrl);
  const value = {
    marketplaceHeadline: limitedRequired(formData, "marketplaceHeadline", 120),
    marketplaceIntro: limitedRequired(formData, "marketplaceIntro", 600),
    marketplaceHeaderImageUrl: uploaded?.publicUrl ?? (removeImage ? null : normalizePublicImageUrl(stringOrNull(formData.get("marketplaceHeaderImageUrl"))) ?? existing.marketplaceHeaderImageUrl ?? null),
    marketplaceHeaderStoragePath: uploaded?.storagePath ?? (removeImage ? null : previousPath),
    marketplaceEmptyTitle: limitedRequired(formData, "marketplaceEmptyTitle", 120),
    marketplaceEmptyBody: limitedRequired(formData, "marketplaceEmptyBody", 600),
    marketplaceAvailableLabel: limitedRequired(formData, "marketplaceAvailableLabel", 60),
    marketplaceReservedLabel: limitedRequired(formData, "marketplaceReservedLabel", 60),
    marketplaceSoldLabel: limitedRequired(formData, "marketplaceSoldLabel", 60),
  };
  try { await upsertPublicSetting("marketplace", value, "Personalización controlada del marketplace", db); }
  catch (error) { if (uploaded) await removeOwnedImage(db, uploaded.storagePath).catch(() => undefined); throw error; }
  if ((uploaded || removeImage) && previousPath && previousPath !== uploaded?.storagePath) await removeOwnedImage(db, previousPath).catch(() => false);
  revalidatePath("/admin/webapp/home");
  revalidatePath("/api/marketplace");
}

export async function saveBrandingSettings(formData: FormData) {
  await protectWebappMutation();
  const db = createAdminClient();
  const existing = await settingValue(db, "branding");
  const image = await validateImageFile(formData.get("logo_image_file"));
  const uploaded = image ? await uploadValidatedImage(db, "branding", image) : null;
  const removeImage = formData.get("remove_logo_image") === "on";
  const previousPath = stringRecordValue(existing, "logoStoragePath") ?? storagePathFromPublicUrl(existing.logoImageUrl);
  const value = {
    creatorName: limitedRequired(formData, "creatorName", 80),
    logoImageUrl: uploaded?.publicUrl ?? (removeImage ? null : existing.logoImageUrl ?? null),
    logoStoragePath: uploaded?.storagePath ?? (removeImage ? null : previousPath),
  };
  try { await upsertPublicSetting("branding", value, "Branding público MiniApp", db); }
  catch (error) { if (uploaded) await removeOwnedImage(db, uploaded.storagePath).catch(() => undefined); throw error; }
  if ((uploaded || removeImage) && previousPath && previousPath !== uploaded?.storagePath) await removeOwnedImage(db, previousPath).catch(() => false);
  revalidatePath("/admin/webapp/branding");
  revalidatePath("/api/marketplace");
}

async function upsertPublicSetting(key: string, value: Record<string, unknown>, description: string, db = createAdminClient()) {
  const { error } = await db.from("webapp_settings").upsert({
    key,
    value,
    is_public: true,
    description,
  }, { onConflict: "key" });
  if (error) throw dbError(error);
  await auditLog("webapp_setting_saved", "Setting WebApp guardado", undefined, {
    module: "webapp", table: "webapp_settings", key, is_public: true,
  });
}

export async function updateInterest(formData: FormData) {
  await protectWebappMutation();
  const id = required(formData, "id");
  const status = enumValue(formData.get("status"), interestStatuses, "seen", "estado de interés");
  const db = createAdminClient();
  const before = await db.from("purchase_interests").select("status, internal_notes, updated_at").eq("id", id).maybeSingle();
  if (before.error || !before.data) throw dbError(before.error, "No se pudo localizar el interés.");
  const internalNotes = limitedOptional(formData.get("internal_notes"), 2_000, "notas internas");
  const changed = await db
    .from("purchase_interests")
    .update({
      status,
      internal_notes: internalNotes,
    })
    .eq("id", id)
    .eq("updated_at", before.data.updated_at)
    .select("id")
    .maybeSingle();
  if (changed.error) throw dbError(changed.error);
  if (!changed.data) throw new Error("Otro administrador modificó este interés. Recarga antes de continuar.");
  await auditLog("webapp_interest_updated", "Interés de marketplace actualizado", undefined, {
    module: "webapp",
    table: "purchase_interests",
    id,
    status,
    before: before.data,
    after: { status, internal_notes: internalNotes },
    has_internal_notes: Boolean(internalNotes)
  });
  revalidatePath("/admin/webapp/interests");
}

export async function restoreRow(formData: FormData) {
  await protectWebappMutation();
  const table = required(formData, "table");
  const id = required(formData, "id");
  if (!mutableTables.has(table)) throw new Error("Tabla no permitida");
  const payload = table === "marketplace_categories"
    ? { status: "draft" }
    : table === "marketplace_items"
      ? { status: "hidden", public_visible: false, sold_at: null, sold_visibility_until: null }
      : { status: "hidden" };
  const { data, error } = await createAdminClient().from(table).update(payload).eq("id", id).eq("status", "archived").select("id").maybeSingle();
  if (error) throw dbError(error, "No se pudo restaurar el registro.");
  if (!data) throw new Error("El registro ya no está archivado o fue modificado por otro administrador.");
  await auditLog("webapp_row_restored", "Registro WebApp restaurado como no publicado", undefined, { module: "webapp", table, id, after: payload });
  revalidatePath("/admin/webapp");
  revalidatePath("/api/marketplace");
}

export async function cleanupOrphanedMarketplaceImages() {
  await protectWebappMutation();
  const db = createAdminClient();
  const [images, categories, settings] = await Promise.all([
    db.from("marketplace_item_images").select("storage_path").not("storage_path", "is", null).limit(1_000),
    db.from("marketplace_categories").select("image_storage_path").not("image_storage_path", "is", null).limit(1_000),
    db.from("webapp_settings").select("value").in("key", ["branding", "marketplace"]).limit(10),
  ]);
  if (images.error || categories.error || settings.error) throw dbError(images.error ?? categories.error ?? settings.error, "No se pudieron calcular las imágenes en uso.");
  const referenced = new Set<string>();
  for (const row of images.data ?? []) if (typeof row.storage_path === "string") referenced.add(row.storage_path);
  for (const row of categories.data ?? []) if (typeof row.image_storage_path === "string") referenced.add(row.image_storage_path);
  for (const row of settings.data ?? []) {
    if (!row.value || typeof row.value !== "object") continue;
    for (const key of ["marketplaceHeaderStoragePath", "logoStoragePath"]) {
      const path = (row.value as Record<string, unknown>)[key];
      if (typeof path === "string") referenced.add(path);
    }
  }
  const stored: string[] = [];
  for (const folder of ["marketplace/items", "marketplace/categories", "marketplace/branding"]) {
    const listed = await db.storage.from("creator-assets").list(folder, { limit: 1_000, sortBy: { column: "name", order: "asc" } });
    if (listed.error) throw dbError(listed.error, "No se pudo revisar Storage.");
    for (const object of listed.data ?? []) {
      const path = `${folder}/${object.name}`;
      if (isOwnedImagePath(path)) stored.push(path);
    }
  }
  const orphaned = stored.filter((path) => !referenced.has(path));
  if (orphaned.length > 0) {
    const removed = await db.storage.from("creator-assets").remove(orphaned);
    if (removed.error) throw dbError(removed.error, "No se pudieron limpiar todas las imágenes huérfanas.");
  }
  await auditLog("webapp_orphan_images_cleaned", "Limpieza segura de imágenes huérfanas completada", undefined, { module: "webapp", removed_count: orphaned.length });
  redirect(`/admin/webapp?cleanup=${orphaned.length}`);
}

export async function deleteRow(formData: FormData) {
  await protectWebappMutation();
  const table = required(formData, "table");
  const id = required(formData, "id");
  if (!mutableTables.has(table)) throw new Error("Tabla no permitida");
  const db = createAdminClient();
  const before = await db.from(table).select("status, updated_at").eq("id", id).maybeSingle();
  if (before.error || !before.data) throw dbError(before.error, "No se pudo localizar el registro.");
  const changed = await db.from(table).update({ status: "archived" }).eq("id", id).eq("updated_at", before.data.updated_at).select("id").maybeSingle();
  if (changed.error) throw dbError(changed.error, "No se pudo archivar el registro.");
  if (!changed.data) throw new Error("Otro administrador modificó el registro. Recarga antes de archivar.");
  await auditLog("webapp_row_archived", "Registro WebApp archivado desde deleteRow", undefined, {
    module: "webapp",
    table,
    id,
    before: before.data,
    after: { status: "archived" },
  });
  revalidatePath("/admin/webapp");
  revalidatePath("/api/marketplace");
}

async function upsert(table: string, id: string | null, payload: Record<string, unknown>) {
  const query = id
    ? createAdminClient().from(table).update(payload).eq("id", id)
    : createAdminClient().from(table).insert(payload);
  const { data, error } = await query.select("id").single();
  if (error) throw dbError(error);
  return typeof data?.id === "string" ? data.id : null;
}

function required(formData: FormData, key: string): string {
  const value = stringOrNull(formData.get(key));
  if (!value) throw new Error(`Falta ${key}`);
  return value;
}

function stringOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stringOrDefault(value: FormDataEntryValue | null, fallback: string): string {
  return stringOrNull(value) ?? fallback;
}

function enumValue(value: FormDataEntryValue | null, allowed: Set<string>, fallback: string, label: string) {
  const raw = stringOrDefault(value, fallback);
  if (!allowed.has(raw)) throw new Error(`Valor inválido para ${label}.`);
  return raw;
}

function slugValue(value: string) {
  const slug = value.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug inválido: usa minúsculas, números y guiones.");
  return slug;
}

function currencyValue(value: FormDataEntryValue | null) {
  const currency = stringOrDefault(value, "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Moneda inválida: usa código ISO de 3 letras, por ejemplo EUR.");
  return currency;
}

function dateValue(value: FormDataEntryValue | null, label: string) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Fecha inválida en ${label}.`);
  return date.toISOString();
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrDefault(value: FormDataEntryValue | null, fallback: number): number {
  return numberOrNull(value) ?? fallback;
}

function limitedRequired(formData: FormData, key: string, max: number) {
  const value = required(formData, key);
  if (value.length > max) throw new Error(`${key} supera el máximo de ${max} caracteres.`);
  return value;
}

function limitedOptional(value: FormDataEntryValue | null, max: number, label: string) {
  const parsed = stringOrNull(value);
  if (parsed && parsed.length > max) throw new Error(`${label} supera el máximo de ${max} caracteres.`);
  return parsed;
}

async function settingValue(db: ReturnType<typeof createAdminClient>, key: string): Promise<Record<string, unknown>> {
  const result = await db.from("webapp_settings").select("value").eq("key", key).maybeSingle();
  if (result.error) throw dbError(result.error, "No se pudo cargar la configuración actual.");
  return result.data?.value && typeof result.data.value === "object" ? result.data.value as Record<string, unknown> : {};
}

function stringRecordValue(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] as string : null;
}

async function saveUploadedItemImage(
  db: ReturnType<typeof createAdminClient>,
  itemId: string,
  image: Awaited<ReturnType<typeof validateImageFile>> & {},
  options: { altText: string | null; requestedPrimary: boolean; replacePrimary: boolean; sortOrder?: number },
) {
  const existingRows = await db.from("marketplace_item_images").select("id, storage_path, is_primary").eq("item_id", itemId).order("sort_order", { ascending: true }).limit(500);
  if (existingRows.error) throw dbError(existingRows.error, "No se pudo cargar la galería actual.");
  const isPrimary = shouldMarkImagePrimary({ requestedPrimary: options.requestedPrimary || options.replacePrimary, existingImageCount: existingRows.data?.length ?? 0 });
  const oldPrimary = existingRows.data?.find((row) => row.is_primary === true) ?? null;
  const uploaded = await uploadValidatedImage(db, "items", image);
  try {
    if (isPrimary) await db.from("marketplace_item_images").update({ is_primary: false }).eq("item_id", itemId).throwOnError();
    const inserted = await db.from("marketplace_item_images").insert({
      item_id: itemId,
      storage_path: uploaded.storagePath,
      public_url: uploaded.publicUrl,
      alt_text: options.altText,
      mime_type: image.mimeType,
      file_size_bytes: image.size,
      width: image.width,
      height: image.height,
      is_primary: isPrimary,
      sort_order: options.sortOrder ?? 10,
    }).select("id").single();
    if (inserted.error || !inserted.data) throw dbError(inserted.error, "No se pudo registrar la imagen subida.");
    if (options.replacePrimary && oldPrimary) {
      const removed = await db.from("marketplace_item_images").delete().eq("id", oldPrimary.id).eq("item_id", itemId);
      if (removed.error) throw dbError(removed.error, "La nueva imagen se guardó, pero no se pudo retirar la anterior.");
      if (typeof oldPrimary.storage_path === "string") await removeOwnedImage(db, oldPrimary.storage_path).catch(() => false);
    }
    return { id: inserted.data.id as string, isPrimary };
  } catch (error) {
    await removeOwnedImage(db, uploaded.storagePath).catch(() => undefined);
    if (oldPrimary?.id) await db.from("marketplace_item_images").update({ is_primary: true }).eq("id", oldPrimary.id);
    throw error;
  }
}
