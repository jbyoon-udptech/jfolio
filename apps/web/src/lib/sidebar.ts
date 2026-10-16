/**
 * Sidebar UI-state helpers shared by the server layout (which reads the cookie)
 * and the client `Sidebar` component (which writes it). Kept in a plain module
 * so the string constant is a real value on both sides — importing a value from
 * a `"use client"` module into a server component yields a client reference.
 */

/** Cookie that persists the sidebar collapse state across reloads. */
export const SIDEBAR_COOKIE = "jfolio_sidebar";

export type SidebarState = "collapsed" | "expanded";

/** Parse the sidebar cookie value; anything unexpected counts as expanded. */
export function parseSidebarState(value: string | undefined): SidebarState {
  return value === "collapsed" ? "collapsed" : "expanded";
}
