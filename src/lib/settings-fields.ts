import type { SettingsGroup } from "./settings";

// Declarative form definition for the Settings page. Shared by the client form
// (rendering) and the server action (coercion), so the two cannot drift.

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "money" | "boolean" | "select";
  help?: string;
  options?: { value: string; label: string }[];
  nullable?: boolean;
  step?: number;
};

export type SettingsSection = {
  group: SettingsGroup;
  title: string;
  description: string;
  roles?: "managers" | "super_admin";
  fields: FieldSpec[];
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    group: "store",
    title: "Store identity",
    description: "Shown on receipts, invoices and emails.",
    fields: [
      { name: "name", label: "Store name", type: "text" },
      { name: "address", label: "Address", type: "textarea" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "taxId", label: "Tax / NTN number", type: "text" },
      { name: "timezone", label: "Timezone", type: "text", help: "IANA name used for daily reports, e.g. Asia/Karachi." },
    ],
  },
  {
    group: "currency",
    title: "Currency display",
    description: "Amounts are stored in paisa; this only affects formatting.",
    fields: [
      { name: "code", label: "Currency code", type: "text" },
      { name: "symbol", label: "Symbol", type: "text" },
      { name: "locale", label: "Number locale", type: "text", help: "e.g. en-PK" },
    ],
  },
  {
    group: "loyalty",
    title: "Loyalty points",
    description: "Points are earned on the amount paid after discounts and excluding redeemed value.",
    fields: [
      { name: "enabled", label: "Loyalty programme enabled", type: "boolean" },
      { name: "earnPerPaisa", label: "Spend per point (PKR)", type: "money", help: "Amount a customer must pay to earn one point." },
      { name: "redeemValuePaisa", label: "Value of one point (PKR)", type: "money" },
      { name: "minRedeemPoints", label: "Minimum points to redeem", type: "number" },
    ],
  },
  {
    group: "stock",
    title: "Stock",
    description: "Defaults for new products and sale behaviour when stock runs out.",
    fields: [
      { name: "defaultReorderLevel", label: "Default reorder level", type: "number", step: 0.001 },
      { name: "allowNegativeStock", label: "Allow sales below zero stock", type: "boolean", help: "Off: a sale fails when there is not enough stock." },
      { name: "lowStockEmails", label: "Send low-stock emails", type: "boolean" },
    ],
  },
  {
    group: "delivery",
    title: "Delivery",
    description: "Defaults for delivery orders; the fee can be edited per order.",
    fields: [
      { name: "feePaisa", label: "Delivery fee (PKR)", type: "money" },
      { name: "freeAbovePaisa", label: "Free delivery above (PKR)", type: "money", nullable: true, help: "Leave blank to never waive the fee." },
    ],
  },
  {
    group: "invoice",
    title: "Invoices",
    description: "Payment terms printed on invoices.",
    fields: [
      { name: "dueDays", label: "Due in (days)", type: "number" },
      { name: "terms", label: "Terms text", type: "textarea" },
    ],
  },
  {
    group: "receipt",
    title: "POS receipt",
    description: "Text printed at the top and bottom of every receipt.",
    fields: [
      { name: "header", label: "Header", type: "textarea" },
      { name: "footer", label: "Footer", type: "textarea" },
    ],
  },
  {
    group: "numbering",
    title: "Document numbering",
    description: "Prefixes for generated numbers (sequence continues even if a prefix changes).",
    fields: [
      { name: "order", label: "Order prefix", type: "text" },
      { name: "invoice", label: "Invoice prefix", type: "text" },
      { name: "purchase", label: "Purchase prefix", type: "text" },
      { name: "submission", label: "Supplier submission prefix", type: "text" },
    ],
  },
  {
    group: "barcode",
    title: "Barcodes",
    description: "Generated EAN-13 barcodes start with this prefix (200–299 is reserved for in-store use).",
    fields: [{ name: "prefix", label: "EAN-13 prefix", type: "text" }],
  },
  {
    group: "tax",
    title: "Tax",
    description: "Default rate applied to new products (prices stay tax-inclusive).",
    fields: [{ name: "defaultRateBps", label: "Default tax rate (%)", type: "number", step: 0.01 }],
  },
];
