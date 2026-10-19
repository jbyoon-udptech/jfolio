import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "jFolio",
  description: "개인 금융자산 통합 관리 시스템",
};

/** Root shell. Authenticated chrome lives in the `(app)` route-group layout. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
