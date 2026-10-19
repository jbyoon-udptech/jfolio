import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";
import { guardMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Updates a signal rule (threshold / enabled / cooldown). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await guardMutation(request);
    const body = await request.json();
    const rule = await mutate.updateSignalRule(params.id, body);
    return NextResponse.json(rule);
  } catch (error) {
    return errorResponse(error);
  }
}

/** SPEC 8.6: DELETE deactivates the rule, preserving its event history. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await guardMutation(request);
    const result = await mutate.deleteSignalRule(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
