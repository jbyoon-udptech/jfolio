import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { SIDEBAR_COOKIE, parseSidebarState } from "@/lib/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "jFolio",
  description: "개인 금융자산 통합 관리 시스템",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const collapsed =
    parseSidebarState(cookies().get(SIDEBAR_COOKIE)?.value) === "collapsed";
  return (
    <html lang="ko">
      <body>
        <div className="layout">
          <Sidebar defaultCollapsed={collapsed} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
