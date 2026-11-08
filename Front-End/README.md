# Shopery grocery storefront

Responsive Shopery storefront migrated to Next.js. The original HTML, CSS, and JavaScript storefront files remain available as the design source.

## Run the Next.js app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To create and run a production build, use `npm run build` and `npm start`.

## Pages included

The storefront has one home page at `/`. Shop 01 and 02, Product Details, User Dashboard, Order History, Order Details, Account Settings, Wishlist, Shopping Cart, Checkout, Sign In, Create Account, Forgot Password, FAQ, Blog List, Single Blog, About Us, Contact Us, Become a Vendor, Track Order, Order Success, Terms, Privacy, and 404 are also included.

## Storefront data and checkout

Sign-in and registration use Auth.js Credentials with the existing `public.customer_accounts` and `public.customer_sessions` tables. Registration also creates or links a record in `star_mart.customers`, which is the customer list used by the Admin app. Set `DATABASE_URL` and `AUTH_SECRET` in `.env` before running the app. Customer login attempts are rate-limited using the shared `star_mart.admin_login_attempts` table. Existing `scrypt$17$...` customer password hashes are verified and upgraded to Argon2id after a successful login.

Active products, categories, prices, stock, and currency are read from the shared `star_mart` database. The cart and wishlist are stored in the browser; checkout revalidates current product prices and stock on the server before creating Admin-visible orders and updating inventory. Checkout currently supports delivery or store pickup with cash on delivery. Authenticated customers can view their order history and order details from the dashboard.

The customer profile photo and non-account profile preferences remain browser-local. The vendor inquiry form is still a frontend demo, and online payment processing is not configured. Product photography is loaded from product records when available, and Poppins is loaded from Google Fonts.

To open the original standalone storefront instead, use `shopery-complete-user-storefront.html`.
