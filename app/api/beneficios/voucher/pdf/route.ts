// C:\Dev\alfra-app\app\api\beneficios\voucher\pdf\route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function sanitizeAscii(s: string): string {
  return (s || "").replace(/[^\x20-\x7E]/g, "?");
}

/**
 * PDF mínimo (sin dependencias) con texto plano.
 * Devuelve STRING para evitar SharedArrayBuffer/Uint8Array en TS.
 */
function buildSimplePdfString(lines: string[]): string {
  const safe = lines.map(sanitizeAscii);

  const startX = 50;
  const y = 780;
  const leading = 18;

  const textOps: string[] = [];
  textOps.push("BT");
  textOps.push("/F1 12 Tf");
  textOps.push(`${startX} ${y} Td`);

  for (let i = 0; i < safe.length; i++) {
    const line = safe[i]
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

    if (i === 0) textOps.push(`(${line}) Tj`);
    else {
      textOps.push(`0 -${leading} Td`);
      textOps.push(`(${line}) Tj`);
    }
  }

  textOps.push("ET");
  const stream = textOps.join("\n");

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  const header = "%PDF-1.4\n";
  const chunks: string[] = [header];
  const offsets: number[] = [0];

  let cursor = header.length;

  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor);
    const objNum = i + 1;
    const block = `${objNum} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(block);
    cursor += block.length;
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i++) {
    const off = String(offsets[i]).padStart(10, "0");
    xref += `${off} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  chunks.push(xref);
  chunks.push(trailer);

  return chunks.join("");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") || "").trim();

    if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "missing_auth" }, { status: 401 });

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
    }

    const uid = userRes.user.id;

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();

    if (pErr || !prof) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

    const role = String(prof.role || "cliente").toLowerCase();
    const isPrivileged = role === "admin" || role === "staff";

    const { data: bv, error: vErr } = await supabaseAdmin
      .from("beneficios_vouchers")
      .select(
        `
        voucher_code,
        status,
        created_at,
        used_at,
        points_spent,
        cash_extra,
        user_id,
        beneficio_id,
        beneficios:beneficio_id (
          title,
          summary,
          category,
          content
        )
      `
      )
      .eq("voucher_code", code)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: "db_error", detail: vErr.message }, { status: 500 });
    if (!bv) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!isPrivileged && bv.user_id !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const beneficio = (bv as any).beneficios || {};
    const title = beneficio.title || "Beneficio";
    const summary = beneficio.summary || "";
    const category = beneficio.category || "";
    const content = beneficio.content || "";

    const createdAt = bv.created_at ? new Date(bv.created_at as any).toLocaleString("es-AR") : "—";
    const usedAt = bv.used_at ? new Date(bv.used_at as any).toLocaleString("es-AR") : null;

    const lines: string[] = [
      "ALFRA - Voucher de Beneficios (Puntos)",
      "--------------------------------------",
      `Codigo: ${bv.voucher_code}`,
      `Estado: ${bv.status || "—"}${usedAt ? " | Usado: " + usedAt : ""}`,
      `Emitido: ${createdAt}`,
      "",
      `Beneficio: ${title}`,
      category ? `Categoria: ${category}` : "",
      summary ? `Resumen: ${summary}` : "",
      "",
      `Costo: ${bv.points_spent ?? 0} pts`,
      `Extra: ${bv.cash_extra && bv.cash_extra > 0 ? "$" + bv.cash_extra : "-"}`,
      "",
      content ? "Detalle:" : "",
      content ? content : "",
      "",
      "Importante: validar en el local. Si hay extra $, se cobra al retirar.",
    ].filter(Boolean);

    const pdfStr = buildSimplePdfString(lines);

    // ✅ TS-safe: BlobPart string
    const blob = new Blob([pdfStr], { type: "application/pdf" });

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="ALFRA-beneficio-${sanitizeAscii(code)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
