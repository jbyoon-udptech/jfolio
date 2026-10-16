import { randomUUID } from "node:crypto";

/** Generate a prefixed, URL-safe id. Keeps ids readable in logs and API output. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
