import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("cron_secret");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    service: "alfra-cron",
    time: new Date().toISOString(),
  });
}
