import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

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
        {page > 1 ? (
          <Link href={hrefFor(basePath, params, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ChevronLeftIcon /> Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-events-none opacity-50" })}>
            <ChevronLeftIcon /> Previous
          </span>
        )}
        <span>
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={hrefFor(basePath, params, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Next <ChevronRightIcon />
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-events-none opacity-50" })}>
            Next <ChevronRightIcon />
          </span>
        )}
      </div>
    </div>
  );
}
