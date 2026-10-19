import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";
import { guardMutation } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Updates a portfolio (name / base currency / default flag). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await guardMutation(request);
    const body = await request.json();
    const portfolio = await mutate.updatePortfolio(params.id, body);
    return NextResponse.json(portfolio);
  } catch (error) {
    return errorResponse(error);
  }
}
