import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { page: number; pageCount: number; total: number; pageSize: number; basePath: string; params: Record<string, string | undefined> };

function hrefFor(basePath: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  sp.set("page", String(page));
  return `${basePath}?${sp.toString()}`;
}

export function PaginationLinks({ page, pageCount, total, pageSize, basePath, params }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} nativeButton={page <= 1} render={page > 1 ? <Link href={hrefFor(basePath, params, page - 1)} /> : undefined}>
          <ChevronLeftIcon /> Previous
        </Button>
        <span>
          Page {page} of {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} nativeButton={page >= pageCount} render={page < pageCount ? <Link href={hrefFor(basePath, params, page + 1)} /> : undefined}>
          Next <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
