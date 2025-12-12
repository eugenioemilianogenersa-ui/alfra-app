import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  console.log("FUDO_WEBHOOK_PAYLOAD:", JSON.stringify(payload, null, 2));
  return NextResponse.json({ ok: true });
}
