import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";
import { guardMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** FR-033/FR-034: edit a ledger entry through the API so the token stays server-side. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await guardMutation(request);
    const { id } = await params;
    const body = await request.json();
    const transaction = await mutate.updateTransaction(id, body);
    return NextResponse.json(transaction);
  } catch (error) {
    return errorResponse(error);
  }
}

/** FR-034: delete a ledger entry; snapshots at/after it are invalidated by the API. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await guardMutation(request);
    const { id } = await params;
    await mutate.deleteTransaction(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
