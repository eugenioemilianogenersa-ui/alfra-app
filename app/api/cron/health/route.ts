import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    service: "alfra-cron",
    time: new Date().toISOString(),
  });
}
