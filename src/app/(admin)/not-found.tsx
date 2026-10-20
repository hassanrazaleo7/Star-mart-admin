import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-heading text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you requested does not exist.</p>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </div>
  );
}
