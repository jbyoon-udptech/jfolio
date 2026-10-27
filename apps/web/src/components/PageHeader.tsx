import type { ReactNode } from "react";
import { CurrentNavLabel } from "@/components/CurrentNavLabel";
import { MobileNavTrigger } from "@/components/MobileNavTrigger";
import { PageHeading } from "@/components/PageHeading";

/**
 * Shared page heading. The context bar shows the portfolio selector and current
 * nav label on every viewport; the label stays centered between the controls
 * and takes its own centered row on narrow viewports. The hamburger is
 * mobile-only. The descriptive heading is visually hidden for assistive
 * technology, and its subtitle sits directly below the bar.
 */
export function PageHeader({
  title,
  subtitle,
  selector,
  actions,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  /** Optional page-specific context, usually a portfolio selector. */
  selector?: ReactNode;
  /** Page-level actions shown on the right. */
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-bar">
        <div className="page-header-left">
          <MobileNavTrigger />
          {selector ? <div className="page-header-selector">{selector}</div> : null}
        </div>
        <CurrentNavLabel />
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
      <PageHeading title={title} subtitle={subtitle} />
    </header>
  );
}
