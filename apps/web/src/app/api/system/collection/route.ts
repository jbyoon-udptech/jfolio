import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";
import { guardMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** SPEC 8.7: manual collection trigger (auth token kept server-side). */
export async function POST(request: Request) {
  try {
    await guardMutation(request);
    const body = await request.json().catch(() => ({}));
    const result = await mutate.runCollection(body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
