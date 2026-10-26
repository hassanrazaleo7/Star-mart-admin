# Product expiry date

Products → New product / Edit product → Stock & unit → Expiry date.
The field is optional. Saving an empty field clears the date. Dates are stored as
Postgres `date` values (YYYY-MM-DD), avoiding timezone shifts. The Products list
shows DD/MM/YYYY. Existing products have no date until one is entered.

## Release order

Apply the additive database migration **before** deploying the new app code,
otherwise queries selecting products can fail because the column is missing.
Use the production database connection in a trusted environment:

```sh
npm run db:migrate
```

This applies pending Drizzle migrations. Verify that the target database and
migration history are correct first. The new migration only adds the nullable
`star_mart.products.expiry_date` column; it does not delete or replace product data.
Do not run `db:reset` or demo seeds to deploy this change.

If applying SQL manually in the Neon SQL editor instead, run:

```sql
ALTER TABLE "star_mart"."products" ADD COLUMN IF NOT EXISTS "expiry_date" date;
```

Manual SQL does not update Drizzle's migration journal. Before subsequently using
`db:migrate`, reconcile migration history with your normal migration process.
Prefer the migration command when your database already uses Drizzle migrations.

## Validation

```sh
npx tsx scripts/check-product-expiry.ts
npm run typecheck
```

After deploying: create a product with an expiry date, reopen Edit and confirm the
same date; change it, save, and check the Products list; clear it and confirm it
stays blank after saving. Invalid calendar dates are rejected server-side.

This is one date per product, not separate batch/lot expiry tracking. It does not
change checkout, stock calculations, vendor approval, or automatically block sales.
