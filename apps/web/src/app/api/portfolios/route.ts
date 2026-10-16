import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";

export const dynamic = "force-dynamic";

/** Creates a portfolio via the API (auth token kept server-side). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const portfolio = await mutate.createPortfolio(body);
    return NextResponse.json(portfolio, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
