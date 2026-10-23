import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";
import { guardMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** FR-001: edit an asset master record. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await guardMutation(request);
    const { id } = await params;
    const body = await request.json();
    const instrument = await mutate.updateInstrument(id, body);
    return NextResponse.json(instrument);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * FR-001: assets referenced by transactions/quotes are soft-deleted
 * (`isActive=false`) to preserve history, never physically removed.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await guardMutation(request);
    const { id } = await params;
    const result = await mutate.deactivateInstrument(id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
