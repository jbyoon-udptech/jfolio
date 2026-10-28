import type { ReactNode } from "react";

/**
 * Page title area. The shared header already shows the current nav label, so
 * the page heading is kept only for assistive technology.
 */
export function PageHeading({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="page-header-heading">
      <h1 className="page-title page-title-visually-hidden">{title}</h1>
      {subtitle ? <p className="page-sub">{subtitle}</p> : null}
    </div>
  );
}
