"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type BeneficioMini = {
  title: string;
  summary: string | null;
  category: string | null;
};

type VoucherRow = {
  id: string;
  created_at: string;
  voucher_code: string;
  points_spent: number;
  cash_extra: number;
  status: string;
  used_at: string | null;
  beneficio_id: string;
  beneficios: BeneficioMini[] | null; // ✅ viene como array
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

      const decoded = decodeURIComponent(code);

      const { data, error } = await supabase
        .from("beneficios_vouchers")
        .select(
          `
          id,
          created_at,
          voucher_code,
          points_spent,
          cash_extra,
          status,
          used_at,
          beneficio_id,
          beneficios:beneficio_id (
            title,
            summary,
            category
          )
        `
        )
        .eq("voucher_code", decoded)
        .maybeSingle();

      if (error) {
        setErrorMsg(`Error al cargar voucher: ${error.code} - ${error.message}`);
        setLoading(false);
        return;
      }

      if (!data) {
        setErrorMsg("Voucher no encontrado (o no tenés acceso).");
        setLoading(false);
        return;
      }

      // ✅ tip seguro (sin cast peligroso)
      setRow({
        id: String(data.id),
        created_at: String(data.created_at),
        voucher_code: String(data.voucher_code),
        points_spent: Number(data.points_spent ?? 0),
        cash_extra: Number(data.cash_extra ?? 0),
        status: String(data.status ?? "emitido"),
        used_at: data.used_at ? String(data.used_at) : null,
        beneficio_id: String(data.beneficio_id),
        beneficios: Array.isArray((data as any).beneficios)
          ? ((data as any).beneficios as BeneficioMini[])
          : null,
      });

      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function printVoucher() {
    window.print();
  }

  const beneficio = row?.beneficios?.[0] ?? null;

  return (
    <main className="max-w-3xl mx-auto p-6">
      {loading && (
        <p className="text-center text-slate-500">Cargando voucher...</p>
      )}

      {!loading && errorMsg && (
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">
          {errorMsg}
        </div>
      )}

      {!loading && row && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">Voucher AlFra</h1>
            <button
              onClick={printVoucher}
              className="border rounded-lg px-3 py-2 text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800"
            >
              Imprimir / Guardar PDF
            </button>
          </div>

          <section className="border rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">Código</div>
                  <div className="text-2xl font-black tracking-widest">
                    {row.voucher_code}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Estado</div>
                  <div className="font-bold">
                    {row.status === "emitido"
                      ? "EMITIDO"
                      : row.status.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="text-xs text-slate-500">Beneficio</div>
                <div className="text-lg font-bold">
                  {beneficio?.title ?? "Beneficio"}
                </div>
                {beneficio?.summary && (
                  <div className="text-sm text-slate-700">
                    {beneficio.summary}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="border rounded-lg p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">
                    Puntos canjeados
                  </div>
                  <div className="font-black text-xl">{row.points_spent}</div>
                </div>
                <div className="border rounded-lg p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">Extra a abonar</div>
                  <div className="font-black text-xl">
                    {row.cash_extra > 0 ? `$${row.cash_extra}` : "—"}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-slate-500">Cómo usarlo</div>
                <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                  <li>Presentá este voucher en el local de AlFra.</li>
                  <li>El personal validará el código.</li>
                  {row.cash_extra > 0 && (
                    <li>
                      Este beneficio requiere abonar{" "}
                      <strong>${row.cash_extra}</strong> extra.
                    </li>
                  )}
                </ul>
              </div>

              <div className="text-[11px] text-slate-500">
                Emitido: {new Date(row.created_at).toLocaleString("es-AR")}
              </div>
            </div>
          </section>

          <div className="text-xs text-slate-500">
            * Tip: en el diálogo de impresión, elegí “Guardar como PDF”.
          </div>
        </div>
      )}
    </main>
  );
}
