"use client";

import { ChevronDownIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminRole } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";

type Props = {
  name: string;
  email: string;
  role: AdminRole;
  logoutAction: () => Promise<void>;
  securityHref?: string;
};

export function UserMenu({ name, email, role, logoutAction, securityHref = "/settings/security" }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={logoutAction} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <span className="max-w-40 truncate">{name}</span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="truncate text-foreground">{email}</span>
              <Badge variant={role === "super_admin" ? "default" : "secondary"}>{ROLE_LABELS[role]}</Badge>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href={securityHref} />}>
            <ShieldCheckIcon />
            Security settings
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => formRef.current?.requestSubmit()}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
