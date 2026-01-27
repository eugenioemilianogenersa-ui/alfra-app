import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const incomingSecret = url.searchParams.get("secret");
    const expectedSecret = process.env.FUDO_WEBHOOK_SECRET;

    const contentType = req.headers.get("content-type") || "";
    const raw = await req.text();

    console.log("FUDO_WEBHOOK_HIT", {
      method: "POST",
      path: url.pathname,
      contentType,
      hasSecret: Boolean(incomingSecret),
    });

    console.log("FUDO_WEBHOOK_RAW", raw);

    if (!expectedSecret || incomingSecret !== expectedSecret) {
      console.error("FUDO_WEBHOOK_INVALID_SECRET");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    console.log("FUDO_WEBHOOK_PARSED", payload);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("FUDO_WEBHOOK_FATAL_ERROR", e?.message || e);
    return NextResponse.json({ ok: true });
  }
}
