import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";
import { guardMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** FR-001: register an asset through the API so the token stays server-side. */
export async function POST(request: Request) {
  try {
    await guardMutation(request);
    const body = await request.json();
    const instrument = await mutate.createInstrument(body);
    return NextResponse.json(instrument, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
