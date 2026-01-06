"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type VoucherRow = {
  kind: "beneficios" | "sellos";
  voucher_code: string;
  status: string | null;
  created_at: string | null;
  used_at: string | null;

  // beneficios
  points_spent: number | null;
  cash_extra: number | null;
  beneficio_title: string | null;
  beneficio_summary: string | null;
  beneficio_category: string | null;
  beneficio_content: string | null;
  beneficio_image_url: string | null;

  // sellos
  reward_name: string | null;
  expires_at: string | null;
};

export default function VoucherClient({ code }: { code: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [row, setRow] = useState<VoucherRow | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      setRow(null);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setErrorMsg("No hay sesión. Iniciá sesión para ver el voucher.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_voucher_by_code", {
        p_code: code,
      });

      if (error) {
        const msg = error.message || "Error al buscar voucher.";
        setErrorMsg(msg.includes("not_authenticated") ? "Iniciá sesión para ver el voucher." : msg);
        setLoading(false);
        return;
      }

      const one = Array.isArray(data) ? data?.[0] : data;
      if (!one) {
        setErrorMsg("Voucher no encontrado (o no tenés acceso).");
        setLoading(false);
        return;
      }

      setRow(one as VoucherRow);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto p-6 text-center text-slate-500">
        Cargando voucher...
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">{errorMsg}</div>
      </main>
    );
  }

  if (!row) return null;

  // BENEFICIOS
  if (row.kind === "beneficios") {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Voucher de Beneficio</h1>
          <p className="text-sm text-slate-600">Presentalo en AlFra para canjear.</p>
        </header>

        <section className="border rounded-xl bg-white p-4 space-y-3">
          <div>
            <div className="text-xs text-slate-500">Código</div>
            <div className="text-xl font-black tracking-wider">{row.voucher_code}</div>
            <div className="text-xs text-slate-500 mt-1">
              Estado: <span className="font-semibold">{row.status ?? "—"}</span>
              {row.used_at ? (
                <span className="ml-2">• Usado: {new Date(row.used_at).toLocaleString()}</span>
              ) : null}
            </div>
          </div>

          {row.beneficio_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.beneficio_image_url}
              alt={row.beneficio_title ?? "Beneficio"}
              className="w-full h-48 object-cover rounded-lg border"
            />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">Costo en puntos</div>
              <div className="font-semibold">{row.points_spent ?? 0} pts</div>
            </div>
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">Extra $</div>
              <div className="font-semibold">
                {row.cash_extra && row.cash_extra > 0 ? `$${row.cash_extra}` : "—"}
              </div>
            </div>
          </div>

          {row.beneficio_title ? (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-[11px] text-slate-500">Beneficio</div>
              <div className="font-bold">{row.beneficio_title}</div>
              {row.beneficio_summary ? (
                <div className="text-sm text-slate-700">{row.beneficio_summary}</div>
              ) : null}
              {row.beneficio_content ? (
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{row.beneficio_content}</div>
              ) : null}
            </div>
          ) : null}

          <div className="text-xs text-slate-500">
            Importante: el canje se valida en el local. Si requiere dinero extra, se cobra al retirar.
          </div>
        </section>
      </main>
    );
  }

  // SELLOS
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Voucher de Sellos</h1>
        <p className="text-sm text-slate-600">Presentalo en AlFra para canjear.</p>
      </header>

      <section className="border rounded-xl bg-white p-4 space-y-3">
        <div className="text-xs text-slate-500">Código</div>
        <div className="text-xl font-black tracking-wider">{row.voucher_code}</div>

        <div className="text-sm">
          Premio: <strong>{row.reward_name ?? "Premio"}</strong>
        </div>

        <div className="text-xs text-slate-500">
          Estado: <strong>{row.status ?? "—"}</strong>
          {row.expires_at ? (
            <span className="ml-2">• Vence: {new Date(row.expires_at).toLocaleDateString()}</span>
          ) : null}
        </div>
      </section>
    </main>
  );
}
