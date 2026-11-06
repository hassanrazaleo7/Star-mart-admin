import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "../../../auth.js";
import { pool } from "../../../lib/db.js";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function isSameOrigin(request) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

    if (!origin || !host) return false;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

function jsonError(message, status) {
    return NextResponse.json({ error: message }, { status });
}

async function getOrders(customerId, orderId) {
    if (orderId && !uuidPattern.test(orderId)) {
        return { error: jsonError("Order not found.", 404) };
    }

    const { rows } = await pool.query(
        `SELECT o.id, o.number, o.status, o.fulfillment, o.payment_status,
                o.total_paisa, o.subtotal_paisa, o.delivery_fee_paisa,
                o.delivery_address, o.customer_phone, o.created_at,
                count(i.id)::integer AS item_count
         FROM star_mart.orders o
         LEFT JOIN star_mart.order_items i ON i.order_id = o.id
         WHERE o.customer_id = $1::uuid
           AND ($2::uuid IS NULL OR o.id = $2::uuid)
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT CASE WHEN $2::uuid IS NULL THEN 100 ELSE 1 END`,
        [customerId, orderId || null],
    );

    if (orderId && rows.length === 0) {
        return { error: jsonError("Order not found.", 404) };
    }

    let items = [];
    if (orderId) {
        const result = await pool.query(
            `SELECT i.name, i.sku, i.unit, i.qty, i.unit_price_paisa,
                    i.line_total_paisa, p.image_url
             FROM star_mart.order_items i
             LEFT JOIN star_mart.products p ON p.id = i.product_id
             WHERE i.order_id = $1::uuid
             ORDER BY i.position, i.id`,
            [orderId],
        );
        items = result.rows;
    }

    return { orders: rows, items };
}

export async function GET(request) {
    const session = await auth();
    const customerId = session?.user?.id;
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
        return jsonError("Please sign in to view your orders.", 401);
    }

    const orderId = new URL(request.url).searchParams.get("id");
    const result = await getOrders(customerId, orderId);
    if (result.error) return result.error;
    return NextResponse.json(result);
}

export async function POST(request) {
    if (!isSameOrigin(request)) {
        return jsonError("Request could not be verified.", 403);
    }

    const session = await auth();
    const customerId = session?.user?.id;
    const customerName = session?.user?.name;
    const customerEmail = typeof session?.user?.email === "string"
        ? session.user.email.trim().toLowerCase()
        : "";

    if (
        typeof customerId !== "string"
        || !uuidPattern.test(customerId)
        || typeof customerName !== "string"
        || !customerName.trim()
        || !validEmail.test(customerEmail)
    ) {
        return jsonError("Please sign in to place an order.", 401);
    }

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return jsonError("Invalid request format.", 415);
    }

    let input;
    try {
        input = await request.json();
    } catch {
        return jsonError("Invalid checkout details.", 400);
    }

    const fulfillment = input?.fulfillment === "pickup" ? "pickup" : input?.fulfillment === "delivery" ? "delivery" : null;
    const deliveryAddress = typeof input?.deliveryAddress === "string" ? input.deliveryAddress.trim() : "";
    const phone = typeof input?.phone === "string" ? input.phone.trim() : "";
    const note = typeof input?.note === "string" ? input.note.trim() : "";
    const requestKey = typeof input?.requestKey === "string" ? input.requestKey : "";
    const requestLines = input?.items;

    if (
        !fulfillment
        || !/^[+()\d.\-\s]{6,40}$/u.test(phone)
        || (fulfillment === "delivery" && (deliveryAddress.length < 5 || deliveryAddress.length > 500))
        || note.length > 1000
        || !uuidPattern.test(requestKey)
        || !Array.isArray(requestLines)
        || requestLines.length < 1
        || requestLines.length > 50
    ) {
        return jsonError("Enter valid contact and delivery details and add at least one product.", 400);
    }

    const quantities = new Map();
    for (const line of requestLines) {
        if (
            typeof line?.productId !== "string"
            || !uuidPattern.test(line.productId)
            || typeof line.qty !== "number"
            || !Number.isFinite(line.qty)
            || line.qty <= 0
            || line.qty > 9999
        ) {
            return jsonError("The cart contains an invalid product or quantity.", 400);
        }

        const quantityMilli = Math.round(line.qty * 1000);
        if (Math.abs(line.qty - quantityMilli / 1000) > 0.000001) {
            return jsonError("Quantities can have at most three decimal places.", 400);
        }
        quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + quantityMilli / 1000);
    }

    const requestMarker = `[storefront-checkout:${requestKey}]`;
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        await client.query("BEGIN");
        transactionStarted = true;
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [`${customerId}:${requestKey}`],
        );

        const priorOrder = await client.query(
            `SELECT id, number
             FROM star_mart.orders
             WHERE customer_id = $1::uuid AND notes LIKE $2
             LIMIT 1`,
            [customerId, `%${requestMarker}%`],
        );

        if (priorOrder.rowCount === 1) {
            await client.query("COMMIT");
            transactionStarted = false;
            return NextResponse.json({
                id: priorOrder.rows[0].id,
                number: priorOrder.rows[0].number,
                reused: true,
            });
        }

        const customer = await client.query(
            `INSERT INTO star_mart.customers (id, name, email, phone, address)
             VALUES ($1::uuid, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               phone = EXCLUDED.phone,
               address = CASE WHEN EXCLUDED.address IS NOT NULL THEN EXCLUDED.address ELSE star_mart.customers.address END,
               updated_at = NOW()
             RETURNING id`,
            [customerId, customerName.trim(), customerEmail, phone, fulfillment === "delivery" ? deliveryAddress : null],
        );
        if (customer.rowCount !== 1) {
            throw new Error("Could not link the customer account to the store.");
        }

        const productIds = [...quantities.keys()].sort();
        const productsResult = await client.query(
            `SELECT id, name, sku, unit, price_paisa, cost_paisa, tax_rate_bps,
                    stock_qty, allow_fractional, status
             FROM star_mart.products
             WHERE id = ANY($1::uuid[])
             ORDER BY id
             FOR UPDATE`,
            [productIds],
        );

        if (productsResult.rowCount !== productIds.length) {
            return await rollbackResponse(client, () => { transactionStarted = false; }, "A product in your cart is no longer available.", 409);
        }

        const productsById = new Map(productsResult.rows.map((product) => [product.id, product]));
        const lines = [];
        for (const [productId, quantity] of quantities) {
            const product = productsById.get(productId);
            if (
                !product
                || product.status !== "active"
                || (!product.allow_fractional && !Number.isInteger(quantity))
                || Number(product.stock_qty) < quantity
            ) {
                return await rollbackResponse(client, () => { transactionStarted = false; }, `${product?.name ?? "A product"} is unavailable in the requested quantity.`, 409);
            }

            const unitPricePaisa = Number(product.price_paisa);
            const lineTotalPaisa = Math.round(unitPricePaisa * Math.round(quantity * 1000) / 1000);
            const taxRateBps = Number(product.tax_rate_bps);
            const taxPaisa = taxRateBps > 0
                ? lineTotalPaisa - Math.round(lineTotalPaisa * 10000 / (10000 + taxRateBps))
                : 0;
            lines.push({
                product,
                quantity,
                unitPricePaisa,
                lineTotalPaisa,
                taxRateBps,
                taxPaisa,
            });
        }

        const subtotalPaisa = lines.reduce((sum, line) => sum + line.lineTotalPaisa, 0);
        const settingsResult = await client.query(
            "SELECT value FROM star_mart.store_settings WHERE key = 'delivery' LIMIT 1",
        );
        const deliverySettings = settingsResult.rows[0]?.value ?? {};
        const deliveryFeePaisa = fulfillment === "delivery"
            && !(deliverySettings.freeAbovePaisa != null && subtotalPaisa >= Number(deliverySettings.freeAbovePaisa))
            ? Math.max(0, Math.round(Number(deliverySettings.feePaisa) || 0))
            : 0;
        const totalPaisa = subtotalPaisa + deliveryFeePaisa;
        const taxPaisa = lines.reduce((sum, line) => sum + line.taxPaisa, 0);
        const counter = await client.query(
            `INSERT INTO star_mart.document_counters (name, value)
             VALUES ('order', 1)
             ON CONFLICT (name) DO UPDATE SET value = star_mart.document_counters.value + 1
             RETURNING value`,
        );
        const numberingResult = await client.query(
            "SELECT value->>'order' AS prefix FROM star_mart.store_settings WHERE key = 'numbering' LIMIT 1",
        );
        const prefix = String(numberingResult.rows[0]?.prefix ?? "ORD").replace(/[^A-Z0-9_-]/giu, "").slice(0, 8) || "ORD";
        const orderNumber = `${prefix}-${String(counter.rows[0].value).padStart(6, "0")}`;
        const orderId = randomUUID();
        const orderNotes = [note, requestMarker].filter(Boolean).join("\n") || null;

        await client.query(
            `INSERT INTO star_mart.orders (
               id, number, channel, fulfillment, status, customer_id,
               customer_name, customer_phone, customer_email, delivery_address,
               delivery_fee_paisa, subtotal_paisa, tax_paisa, total_paisa,
               paid_paisa, payment_status, notes, stock_deducted_at
             ) VALUES (
               $1::uuid, $2, 'phone', $3::star_mart.order_fulfillment,
               'pending', $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12,
               0, 'unpaid', $13, NOW()
             )`,
            [
                orderId,
                orderNumber,
                fulfillment,
                customerId,
                customerName.trim(),
                phone,
                customerEmail,
                fulfillment === "delivery" ? deliveryAddress : null,
                deliveryFeePaisa,
                subtotalPaisa,
                taxPaisa,
                totalPaisa,
                orderNotes,
            ],
        );

        for (const [position, line] of lines.entries()) {
            const { product, quantity, unitPricePaisa, lineTotalPaisa, taxRateBps, taxPaisa: lineTax } = line;
            const stockUpdate = await client.query(
                `UPDATE star_mart.products
                 SET stock_qty = stock_qty - $2::numeric, updated_at = NOW()
                 WHERE id = $1::uuid AND stock_qty >= $2::numeric
                 RETURNING id`,
                [product.id, quantity],
            );
            if (stockUpdate.rowCount !== 1) {
                return await rollbackResponse(client, () => { transactionStarted = false; }, `${product.name} just sold out. Please update your cart.`, 409);
            }

            await client.query(
                `INSERT INTO star_mart.order_items (
                   order_id, product_id, position, name, sku, unit, qty,
                   unit_price_paisa, cost_paisa, tax_rate_bps, tax_paisa, line_total_paisa
                 ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    orderId, product.id, position, product.name, product.sku,
                    product.unit, quantity, unitPricePaisa, product.cost_paisa,
                    taxRateBps, lineTax, lineTotalPaisa,
                ],
            );
            await client.query(
                `INSERT INTO star_mart.stock_movements (
                   product_id, qty_delta, kind, ref_type, ref_id,
                   unit_cost_paisa, note
                 ) VALUES ($1::uuid, -$2::numeric, 'sale', 'order', $3::uuid, $4, 'Storefront checkout')`,
                [product.id, quantity, orderId, product.cost_paisa],
            );
        }

        await client.query(
            `INSERT INTO star_mart.order_events (order_id, from_status, to_status, note)
             VALUES ($1::uuid, NULL, 'pending', 'Online storefront order placed')`,
            [orderId],
        );
        await client.query(
            `UPDATE public.customer_accounts
             SET phone = $2
             WHERE id = $1`,
            [customerId, phone],
        );
        await client.query("COMMIT");
        transactionStarted = false;

        return NextResponse.json({ id: orderId, number: orderNumber }, { status: 201 });
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Storefront order rollback failed", rollbackError);
            }
        }

        if (error?.code === "23505") {
            return jsonError("That phone number is already linked to another customer account.", 409);
        }
        console.error("Storefront order creation failed", error);
        return jsonError("We could not place your order right now. Please try again.", 500);
    } finally {
        client.release();
    }
}

async function rollbackResponse(client, markRolledBack, message, status) {
    await client.query("ROLLBACK");
    markRolledBack();
    return jsonError(message, status);
}
