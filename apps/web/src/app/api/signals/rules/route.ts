import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";

export const dynamic = "force-dynamic";

/** Creates a signal rule via the API (auth token kept server-side). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rule = await mutate.createSignalRule(body);
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
