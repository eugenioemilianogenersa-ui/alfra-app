import { NextResponse } from "next/server";
import { sendPointsPush } from "../../../../lib/push/sendPointsPush";

export async function POST(req: Request) {
  try {
    const { userId, delta, reason } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    const res = await sendPointsPush({
      userId: String(userId),
      delta: Number(delta || 0),
      reason: typeof reason === "string" ? reason : null,
      url: "/puntos",
    });

    return NextResponse.json(res);
  } catch (err) {
    console.error("notify-points fatal:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
