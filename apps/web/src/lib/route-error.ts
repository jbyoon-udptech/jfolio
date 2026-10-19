import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { AuthGuardError } from "@/lib/server-auth";

/**
 * Normalise an error thrown by the API client into a JSON response the browser
 * form can display. Mirrors the API error envelope: `{ error: { code, message } }`.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthGuardError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, status: error.status } },
      { status: error.status },
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { message: error.message, status: error.status } },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  return NextResponse.json({ error: { message, status: 500 } }, { status: 500 });
}
