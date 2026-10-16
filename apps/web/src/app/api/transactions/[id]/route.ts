import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";

export const dynamic = "force-dynamic";

/** FR-033/FR-034: edit a ledger entry through the API so the token stays server-side. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const transaction = await mutate.updateTransaction(params.id, body);
    return NextResponse.json(transaction);
  } catch (error) {
    return errorResponse(error);
  }
}

/** FR-034: delete a ledger entry; snapshots at/after it are invalidated by the API. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await mutate.deleteTransaction(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
