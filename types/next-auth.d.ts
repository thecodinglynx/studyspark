import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: "USER" | "ADMIN";
      /** Name of the user's group, if they are in one. */
      groupName: string | null;
    };
  }

  interface User {
    username: string;
    role?: "USER" | "ADMIN";
    groupName?: string | null;
    /** When the role and group were last looked up (ms since 1970). */
    profileCheckedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "USER" | "ADMIN";
    groupName?: string | null;
    /** When the role and group were last looked up (ms since 1970). */
    profileCheckedAt?: number;
  }
}
