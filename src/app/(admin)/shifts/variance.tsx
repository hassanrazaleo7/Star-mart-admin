import { formatPKR } from "@/lib/money";

export function Variance({ paisa }: { paisa: number | null }) {
  if (paisa == null) return <span className="text-muted-foreground">—</span>;
  if (paisa === 0) return <span className="text-primary">balanced</span>;
  return <span className={paisa < 0 ? "font-medium text-destructive" : "font-medium text-amber-600"}>{paisa < 0 ? "−" : "+"}{formatPKR(Math.abs(paisa))}</span>;
}
