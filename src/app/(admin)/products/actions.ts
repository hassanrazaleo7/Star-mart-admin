"use server";

import { del } from "@vercel/blob";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { categories, orderItems, products, purchaseItems, stockMovements, suppliers } from "@/db/schema";
import { env } from "@/env";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { describeImageUrlProblem } from "@/lib/blob-urls";
import { isUniqueViolation } from "@/lib/db-errors";
import { generateEan13 } from "@/lib/products/barcode";
import { parseProductsCsv, type ParsedImportRow } from "@/lib/products/csv";
import { searchProducts, type ProductSearchRow } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { batchInflowItems } from "@/lib/stock/batches";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { categoryInputSchema, importRowParsedSchema, productInputSchema, type ImportRow } from "@/lib/validation/products";

const PRODUCTS = "/products";

function scheduleBlobDelete(pathname: string | null | undefined) {
  if (!pathname || !env.blobConfigured) return;
  after(async () => {
    try {
      await del(pathname);
    } catch (error) {
      console.warn("[blob] could not delete", pathname, error);
    }
  });
}

export type ProductFormState = { error: string | null };

export async function saveProductAction(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = productInputSchema.safeParse({
    id: formData.get("id"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    name: formData.get("name"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    brand: formData.get("brand"),
    unit: formData.get("unit"),
    allowFractional: formData.get("allowFractional"),
    costPaisa: formData.get("costPaisa"),
    pricePaisa: formData.get("pricePaisa"),
    taxRateBps: formData.get("taxRateBps"),
    reorderLevel: formData.get("reorderLevel"),
    reorderQty: formData.get("reorderQty"),
    supplierId: formData.get("supplierId"),
    imageUrl: formData.get("imageUrl"),
    imagePathname: formData.get("imagePathname"),
    status: formData.get("status"),
    initialStock: formData.get("initialStock"),
    tracksExpiry: formData.get("tracksExpiry"),
    shelfLifeDays: formData.get("shelfLifeDays"),
    expiryWarningDays: formData.get("expiryWarningDays"),
    initialBatchCode: formData.get("initialBatchCode"),
    initialExpiry: formData.get("initialExpiry"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  const imageProblem = describeImageUrlProblem(input.imageUrl);
  if (imageProblem) return { error: imageProblem };
  const imageUrl = input.imageUrl ?? null;
  const meta = await getRequestMeta();

  const values = {
    sku: input.sku,
    barcode: input.barcode,
    name: input.name,
    description: input.description,
    categoryId: input.categoryId ?? null,
    brand: input.brand,
    unit: input.unit,
    allowFractional: input.allowFractional,
    costPaisa: input.costPaisa,
    pricePaisa: input.pricePaisa,
    taxRateBps: input.taxRateBps,
    reorderLevel: input.reorderLevel,
    reorderQty: input.reorderQty,
    supplierId: input.supplierId ?? null,
    imageUrl,
    imagePathname: imageUrl ? input.imagePathname : null,
    status: input.status,
    tracksExpiry: input.tracksExpiry,
    shelfLifeDays: input.shelfLifeDays,
    expiryWarningDays: input.expiryWarningDays,
  };

  try {
    if (input.id) {
      const existing = await db.query.products.findFirst({ where: eq(products.id, input.id) });
      if (!existing) return { error: "That product no longer exists." };
      await db.update(products).set({ ...values, updatedAt: sql`now()` }).where(eq(products.id, input.id));
      if (existing.imagePathname && existing.imagePathname !== values.imagePathname) scheduleBlobDelete(existing.imagePathname);
      await audit("product.updated", { ...meta, actorUserId: ctx.user.id, metadata: { productId: input.id, sku: input.sku } });
      revalidatePath(PRODUCTS);
      redirect(`${PRODUCTS}?status=product_updated`);
    }

    if (input.initialStock > 0 && input.tracksExpiry && !input.initialExpiry) return { error: "Enter the expiry date of the opening stock, or turn off expiry tracking." };
    const id = crypto.randomUUID();
    const movements = input.initialStock > 0
      ? batchInflowItems(
          { productId: id, qty: input.initialStock, source: "initial", batchCode: input.initialBatchCode, expiry: input.initialExpiry, unitCostPaisa: input.costPaisa, supplierId: input.supplierId ?? null, createdBy: ctx.user.id },
          { kind: "initial", refType: "initial", refId: id, unitCostPaisa: input.costPaisa, createdBy: ctx.user.id },
        ).items
      : [];
    await db.batch([db.insert(products).values({ id, ...values, createdBy: ctx.user.id }), ...movements]);
    await audit("product.created", { ...meta, actorUserId: ctx.user.id, metadata: { productId: id, sku: input.sku, initialStock: input.initialStock } });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A product with that SKU or barcode already exists." };
    throw error;
  }
  revalidatePath(PRODUCTS);
  redirect(`${PRODUCTS}?status=product_created`);
}

export async function setProductStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("productId"));
  const status = formData.get("status");
  if (!id.success || (status !== "active" && status !== "archived" && status !== "draft")) redirect(`${PRODUCTS}?status=not_found`);
  const meta = await getRequestMeta();
  const rows = await db.update(products).set({ status, updatedAt: sql`now()` }).where(eq(products.id, id.data)).returning({ id: products.id });
  if (!rows.length) redirect(`${PRODUCTS}?status=not_found`);
  await audit(status === "archived" ? "product.archived" : "product.restored", { ...meta, actorUserId: ctx.user.id, metadata: { productId: id.data, status } });
  revalidatePath(PRODUCTS);
  redirect(`${PRODUCTS}?status=${status === "archived" ? "product_archived" : "product_restored"}`);
}

/** Deletes a product only when nothing references it; otherwise archives it. */
export async function deleteProductAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("productId"));
  if (!id.success) redirect(`${PRODUCTS}?status=not_found`);
  const meta = await getRequestMeta();
  const existing = await db.query.products.findFirst({ where: eq(products.id, id.data) });
  if (!existing) redirect(`${PRODUCTS}?status=not_found`);

  const [refs] = await db
    .select({
      n: sql<number>`(select count(*) from ${purchaseItems} where ${purchaseItems.productId} = ${id.data})::int
        + (select count(*) from ${orderItems} where ${orderItems.productId} = ${id.data})::int
        + (select count(*) from ${stockMovements} where ${stockMovements.productId} = ${id.data} and ${stockMovements.kind} <> 'initial')::int`,
    })
    .from(sql`(select 1) as one`);
  if (Number(refs?.n ?? 0) > 0) {
    await db.update(products).set({ status: "archived", updatedAt: sql`now()` }).where(eq(products.id, id.data));
    await audit("product.archived", { ...meta, actorUserId: ctx.user.id, metadata: { productId: id.data, reason: "referenced" } });
    revalidatePath(PRODUCTS);
    redirect(`${PRODUCTS}?status=product_archived_instead`);
  }
  await db.delete(products).where(eq(products.id, id.data));
  scheduleBlobDelete(existing.imagePathname);
  await audit("product.deleted", { ...meta, actorUserId: ctx.user.id, metadata: { productId: id.data, sku: existing.sku } });
  revalidatePath(PRODUCTS);
  redirect(`${PRODUCTS}?status=product_deleted`);
}

/** Returns a fresh in-store EAN-13 for the product form (not yet assigned). */
export async function generateBarcodeAction(): Promise<string> {
  await requireRole([...ROLE_GROUPS.managers, "vendor"]);
  const settings = await getSettings();
  return generateEan13(settings.barcode.prefix);
}

/** Lightweight search for comboboxes (managers + cashiers). */
export async function searchProductsAction(query: string): Promise<ProductSearchRow[]> {
  await requireRole(ROLE_GROUPS.staff);
  return searchProducts(query, { limit: 10 });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryState = { error: string | null };

export async function saveCategoryAction(_previous: CategoryState, formData: FormData): Promise<CategoryState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = categoryInputSchema.safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  try {
    if (parsed.data.id) {
      await db.update(categories).set({ name: parsed.data.name }).where(eq(categories.id, parsed.data.id));
      await audit("category.updated", { ...meta, actorUserId: ctx.user.id, metadata: { categoryId: parsed.data.id, name: parsed.data.name } });
    } else {
      const [row] = await db.insert(categories).values({ name: parsed.data.name }).returning({ id: categories.id });
      await audit("category.created", { ...meta, actorUserId: ctx.user.id, metadata: { categoryId: row?.id, name: parsed.data.name } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A category with that name already exists." };
    throw error;
  }
  revalidatePath(`${PRODUCTS}/categories`);
  return { error: null };
}

export async function setCategoryActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("categoryId"));
  if (!id.success) redirect(`${PRODUCTS}/categories`);
  const active = formData.get("active") === "true";
  await db.update(categories).set({ isActive: active }).where(eq(categories.id, id.data));
  const meta = await getRequestMeta();
  await audit("category.updated", { ...meta, actorUserId: ctx.user.id, metadata: { categoryId: id.data, isActive: active } });
  revalidatePath(`${PRODUCTS}/categories`);
  redirect(`${PRODUCTS}/categories?status=category_saved`);
}

// ---------------------------------------------------------------------------
// CSV import (two steps: preview, then commit the validated rows)
// ---------------------------------------------------------------------------

export type ImportPreviewRow = { line: number; sku: string; name: string; action: "create" | "update" | "error"; error?: string };
export type ImportState = {
  error: string | null;
  step: "upload" | "preview" | "done";
  preview?: ImportPreviewRow[];
  summary?: { create: number; update: number; error: number };
  payload?: string; // validated rows (JSON) carried to the commit step
  result?: { created: number; updated: number; skipped: number };
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function importProductsAction(previous: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const step = formData.get("step") === "commit" ? "commit" : "preview";

  let rows: ParsedImportRow[];
  if (step === "preview") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first.", step: "upload" };
    if (file.size > MAX_FILE_BYTES) return { error: "The file is larger than 4 MB.", step: "upload" };
    const parsed = parseProductsCsv(await file.text());
    if (parsed.headerError) return { error: parsed.headerError, step: "upload" };
    rows = parsed.rows;
  } else {
    const payload = String(formData.get("payload") ?? previous.payload ?? "");
    let raw: unknown[];
    try {
      raw = JSON.parse(payload) as unknown[];
    } catch {
      return { error: "The preview expired. Upload the file again.", step: "upload" };
    }
    rows = raw.map((r, i) => {
      const parsed = importRowParsedSchema.safeParse(r);
      return parsed.success ? { line: i + 2, raw: {}, data: parsed.data } : { line: i + 2, raw: {}, error: firstIssue(parsed.error) };
    });
  }

  const valid = rows.filter((r): r is ParsedImportRow & { data: ImportRow } => Boolean(r.data));
  const skus = valid.map((r) => r.data.sku);
  const existing = skus.length
    ? await db.select({ id: products.id, sku: products.sku }).from(products).where(inArray(products.sku, skus))
    : [];
  const existingBySku = new Map(existing.map((e) => [e.sku, e.id]));

  if (step === "preview") {
    const preview: ImportPreviewRow[] = rows.map((r) =>
      r.data
        ? { line: r.line, sku: r.data.sku, name: r.data.name, action: existingBySku.has(r.data.sku) ? "update" : "create" }
        : { line: r.line, sku: String(r.raw.sku ?? ""), name: String(r.raw.name ?? ""), action: "error", error: r.error },
    );
    const summary = {
      create: preview.filter((p) => p.action === "create").length,
      update: preview.filter((p) => p.action === "update").length,
      error: preview.filter((p) => p.action === "error").length,
    };
    return { error: null, step: "preview", preview: preview.slice(0, 500), summary, payload: JSON.stringify(valid.map((r) => r.data)) };
  }

  // Commit: categories and suppliers by name, then upsert products in chunks.
  const categoryNames = [...new Set(valid.map((r) => r.data.category).filter((c): c is string => Boolean(c)))];
  if (categoryNames.length) {
    await db.insert(categories).values(categoryNames.map((name) => ({ name }))).onConflictDoNothing();
  }
  const [categoryRows, supplierRows] = await Promise.all([db.select({ id: categories.id, name: categories.name }).from(categories), db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers)]);
  const categoryByName = new Map(categoryRows.map((c) => [c.name.toLowerCase(), c.id]));
  const supplierByName = new Map(supplierRows.map((s) => [s.name.toLowerCase(), s.id]));

  let created = 0;
  let updated = 0;
  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const statements = chunk.flatMap(({ data }) => {
      const base = {
        name: data.name,
        barcode: data.barcode,
        description: data.description,
        categoryId: data.category ? (categoryByName.get(data.category.toLowerCase()) ?? null) : null,
        brand: data.brand,
        unit: data.unit,
        allowFractional: data.allow_fractional,
        costPaisa: data.cost,
        pricePaisa: data.price,
        taxRateBps: data.tax_rate_percent,
        reorderLevel: data.reorder_level,
        reorderQty: data.reorder_qty,
        supplierId: data.supplier ? (supplierByName.get(data.supplier.toLowerCase()) ?? null) : null,
        status: data.status,
        ...(data.tracks_expiry == null ? {} : { tracksExpiry: data.tracks_expiry }),
        ...(data.shelf_life_days == null ? {} : { shelfLifeDays: data.shelf_life_days }),
      };
      const existingId = existingBySku.get(data.sku);
      if (existingId) {
        updated += 1;
        return [db.update(products).set({ ...base, updatedAt: sql`now()` }).where(eq(products.id, existingId))];
      }
      created += 1;
      const id = crypto.randomUUID();
      return [
        db.insert(products).values({ id, sku: data.sku, ...base, createdBy: ctx.user.id }),
        ...(data.stock_qty > 0
          ? batchInflowItems(
              { productId: id, qty: data.stock_qty, source: "initial", expiry: data.initial_expiry, unitCostPaisa: data.cost, supplierId: base.supplierId, createdBy: ctx.user.id },
              { kind: "initial", refType: "initial", refId: id, unitCostPaisa: data.cost, createdBy: ctx.user.id },
            ).items
          : []),
      ];
    });
    if (statements.length) {
      const [first, ...rest] = statements;
      await db.batch([first, ...rest]);
    }
  }

  const meta = await getRequestMeta();
  await audit("products.imported", { ...meta, actorUserId: ctx.user.id, metadata: { created, updated, skipped: rows.length - valid.length } });
  revalidatePath(PRODUCTS);
  return { error: null, step: "done", result: { created, updated, skipped: rows.length - valid.length } };
}
