import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AUTH_REQUIRED } from "@/lib/auth-config";
import { currentUser } from "@/lib/server-auth";
import { SIDEBAR_COOKIE, parseSidebarState } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

/**
 * Protected application shell. The session is validated against the API on
 * every request, so a deleted, disabled or expired account loses access even
 * if its cookie is still present.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser().catch(() => null);
  if (AUTH_REQUIRED && !user) redirect("/login");

  const collapsed =
    parseSidebarState(cookies().get(SIDEBAR_COOKIE)?.value) === "collapsed";

  return (
    <div className="layout">
      <Sidebar defaultCollapsed={collapsed} user={user} />
      <main className="main">{children}</main>
    </div>
  );
}
