STAR MART STOREFRONT

Run the Next.js storefront from this folder:

1. Configure DATABASE_URL and the NextAuth environment variables used by auth.js.
2. Ensure the Admin project's database migrations have been applied.
3. Run npm install if dependencies are not installed.
4. Run npm run dev and open the local URL printed by Next.js.

The storefront reads active categories, products, prices, images, and stock from the shared star_mart database schema. Category pages use /categories/{category-id}. The shopping bag is stored in the visitor's browser; checkout requires a signed-in customer account and creates an order in the existing star_mart orders and order_items tables. Orders can be viewed at /account. Payment is recorded as unpaid and is due in cash at pickup or delivery; online payment processing is not configured.
