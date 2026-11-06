import { NextResponse } from "next/server";
import { pool } from "../../../lib/db.js";

export const runtime = "nodejs";

export async function GET() {
    const [categoriesResult, productsResult, settingsResult, deliveryResult] = await Promise.all([
        pool.query(
            `SELECT c.id, c.name, count(p.id)::integer AS product_count
             FROM star_mart.categories c
             LEFT JOIN star_mart.products p
               ON p.category_id = c.id AND p.status = 'active'
             WHERE c.is_active = true
             GROUP BY c.id, c.name
             ORDER BY c.name`,
        ),
        pool.query(
            `SELECT p.id, p.name, p.description, p.sku, p.unit, p.price_paisa,
                    p.tax_rate_bps, p.stock_qty, p.allow_fractional, p.image_url,
                    p.category_id, c.name AS category_name
             FROM star_mart.products p
             LEFT JOIN star_mart.categories c ON c.id = p.category_id
             WHERE p.status = 'active'
             ORDER BY p.name, p.id
             LIMIT 1000`,
        ),
        pool.query(
            "SELECT value FROM star_mart.store_settings WHERE key = 'currency' LIMIT 1",
        ),
        pool.query(
            "SELECT value FROM star_mart.store_settings WHERE key = 'delivery' LIMIT 1",
        ),
    ]);

    return NextResponse.json({
        categories: categoriesResult.rows,
        products: productsResult.rows,
        currency: settingsResult.rows[0]?.value ?? { code: "PKR", symbol: "Rs", locale: "en-PK" },
        delivery: deliveryResult.rows[0]?.value ?? {},
    }, {
        headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
    });
}
