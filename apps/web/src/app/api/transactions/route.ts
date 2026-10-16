import { NextResponse } from "next/server";
import { mutate } from "@/lib/api";
import { errorResponse } from "@/lib/route-error";

export const dynamic = "force-dynamic";

/** Proxies transaction creation to the API so the auth token stays server-side. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const transaction = await mutate.createTransaction(body);
    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
