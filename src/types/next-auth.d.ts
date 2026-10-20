import type { DefaultSession } from "next-auth";
import type { AdminRole } from "@/db/schema";

declare module "next-auth" {
  interface User {
    role?: AdminRole;
    sid?: string;
    sessionVersion?: number;
    mustChangePassword?: boolean;
  }

  interface Session {
    sid: string;
    sv: number;
    absExp: number;
    user: {
      id: string;
      email: string;
      name: string;
      role: AdminRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sid?: string;
    sv?: number;
    role?: AdminRole;
    absExp?: number;
  }
}
