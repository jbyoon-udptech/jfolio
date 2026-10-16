import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";

export const dynamic = "force-dynamic";

/** FR-001: edit an asset master record. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const instrument = await mutate.updateInstrument(params.id, body);
    return NextResponse.json(instrument);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * FR-001: assets referenced by transactions/quotes are soft-deleted
 * (`isActive=false`) to preserve history, never physically removed.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await mutate.deactivateInstrument(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
