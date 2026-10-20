import { ReportsNav } from "./reports-nav";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Sales, purchasing, profit, expenses, stock and balances. Dates follow the store timezone.</p>
      </div>
      <ReportsNav />
      {children}
    </div>
  );
}
