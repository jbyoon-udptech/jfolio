import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "jFolio",
  description: "개인 금융자산 통합 관리 시스템",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <h1 className="brand">jFolio</h1>
            <p className="brand-sub">통합 자산 관리</p>
            <nav className="nav">
              <Nav />
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
