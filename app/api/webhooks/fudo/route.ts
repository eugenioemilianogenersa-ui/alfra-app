import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const incomingSecret = url.searchParams.get("secret");
  const expectedSecret = process.env.FUDO_WEBHOOK_SECRET;

  const contentType = req.headers.get("content-type") || "";
  const raw = await req.text();

  console.log("FUDO_WEBHOOK_HIT", {
    path: url.pathname,
    hasSecret: Boolean(incomingSecret),
    contentType,
  });

  // Logueo crudo para ver qué manda Fudo (JSON o no)
  console.log("FUDO_WEBHOOK_RAW", raw);

  // Validación secret (pero igual dejamos log para debug)
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    console.error("FUDO_WEBHOOK_INVALID_SECRET", {
      incomingSecret: incomingSecret ? "present" : "missing",
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Parse si es JSON
  let payload: any = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }
  console.log("FUDO_WEBHOOK_PARSED", payload);

  return NextResponse.json({ ok: true });
}
