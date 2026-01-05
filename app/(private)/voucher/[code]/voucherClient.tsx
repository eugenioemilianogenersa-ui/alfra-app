"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type BeneficioVoucherRow = {
  id: string;
  created_at: string;
  voucher_code: string;
  points_spent: number;
  cash_extra: number;
  status: string;
  used_at: string | null;
  beneficio_id: string;
  beneficios?: {
    title: string;
    summary: string | null;
    category: string | null;
    content: string | null;
    image_url: string | null;
  } | null;
};

type StampsVoucherRow = {
  id: string;
  code: string;
  status: string;
  reward_name: string;
  issued_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  canceled_at: string | null;
};

export default function VoucherClient({ code }: { code: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [beneficioVoucher, setBeneficioVoucher] = useState<BeneficioVoucherRow | null>(null);
  const [stampsVoucher, setStampsVoucher] = useState<StampsVoucherRow | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      setBeneficioVoucher(null);
      setStampsVoucher(null);

      // 1) intentamos BENEFICIOS
      const { data: bRow, error: bErr } = await supabase
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
          beneficios:beneficios(
            title,
            summary,
            category,
            content,
            image_url
          )
        `
        )
        .eq("voucher_code", code)
        .maybeSingle();

      if (bErr) {
        setErrorMsg(`Error al buscar voucher: ${bErr.code} - ${bErr.message}`);
        setLoading(false);
        return;
      }

      if (bRow) {
        setBeneficioVoucher(bRow as unknown as BeneficioVoucherRow);
        setLoading(false);
        return;
      }

      // 2) si no existe, intentamos SELLOS
      const { data: sRow, error: sErr } = await supabase
        .from("stamps_vouchers")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (sErr) {
        setErrorMsg(`Error al buscar voucher: ${sErr.code} - ${sErr.message}`);
        setLoading(false);
        return;
      }

      if (sRow) {
        setStampsVoucher(sRow as StampsVoucherRow);
        setLoading(false);
        return;
      }

      setErrorMsg("Voucher no encontrado (o no tenés acceso).");
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
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">
          {errorMsg}
        </div>
      </main>
    );
  }

  // Render BENEFICIOS
  if (beneficioVoucher) {
    const b = beneficioVoucher;
    const info = b.beneficios;

    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Voucher de Beneficio</h1>
          <p className="text-sm text-slate-600">Presentalo en AlFra para canjear.</p>
        </header>

        <section className="border rounded-xl bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500">Código</div>
              <div className="text-xl font-black tracking-wider">{b.voucher_code}</div>
              <div className="text-xs text-slate-500 mt-1">
                Estado: <span className="font-semibold">{b.status}</span>
                {b.used_at ? (
                  <span className="ml-2">• Usado: {new Date(b.used_at).toLocaleString()}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">Costo en puntos</div>
              <div className="font-semibold">{b.points_spent} pts</div>
            </div>
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">Extra $</div>
              <div className="font-semibold">{b.cash_extra > 0 ? `$${b.cash_extra}` : "—"}</div>
            </div>
          </div>

          {info?.title && (
            <div className="border rounded-lg p-3">
              <div className="text-[11px] text-slate-500">Beneficio</div>
              <div className="font-bold">{info.title}</div>
              {info.summary ? <div className="text-sm text-slate-700">{info.summary}</div> : null}
              {info.content ? (
                <div className="text-sm text-slate-700 whitespace-pre-wrap mt-2">{info.content}</div>
              ) : null}
            </div>
          )}

          <div className="text-xs text-slate-500">
            Importante: el canje se valida en el local. Si requiere dinero extra, se cobra al retirar.
          </div>
        </section>
      </main>
    );
  }

  // Render SELLOS
  if (stampsVoucher) {
    const v = stampsVoucher;

    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Voucher de Sellos</h1>
          <p className="text-sm text-slate-600">Presentalo en AlFra para canjear.</p>
        </header>

        <section className="border rounded-xl bg-white p-4 space-y-3">
          <div className="text-xs text-slate-500">Código</div>
          <div className="text-xl font-black tracking-wider">{v.code}</div>

          <div className="text-sm">
            Premio: <strong>{v.reward_name}</strong>
          </div>

          <div className="text-xs text-slate-500">
            Estado: <strong>{v.status}</strong>
            {v.expires_at ? (
              <span className="ml-2">• Vence: {new Date(v.expires_at).toLocaleDateString()}</span>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return null;
}
