import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "positive" | "negative" }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-xl tabular-nums ${tone === "negative" ? "text-destructive" : tone === "positive" ? "text-primary" : ""}`}>{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}
