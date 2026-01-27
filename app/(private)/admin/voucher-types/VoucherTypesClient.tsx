"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type VoucherType = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  benefit_type: string;
  benefit_value: number | null;
  currency: string;
  conditions: string | null;
  expires_in_days: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ApiListResp = {
  ok: boolean;
  currentStampsVoucherTypeId: string | null;
  rows: VoucherType[];
};

function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

export default function VoucherTypesClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("");

  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<VoucherType[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<VoucherType | null>(null);
  const [open, setOpen] = useState(false);

  // form
  const [fSlug, setFSlug] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fBenefitType, setFBenefitType] = useState("custom");
  const [fBenefitValue, setFBenefitValue] = useState<string>("");
  const [fCurrency, setFCurrency] = useState("ARS");
  const [fConditions, setFConditions] = useState("");
  const [fExpires, setFExpires] = useState<string>("30");
  const [fEnabled, setFEnabled] = useState(true);

  useEffect(() => {
    async function boot() {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) {
        router.replace("/login");
        return;
      }

      const { data: roleRpc } = await supabase.rpc("get_my_role");
      const r = String(roleRpc || "").toLowerCase();
      if (!["admin", "staff"].includes(r)) {
        router.replace("/dashboard");
        return;
      }

      setRole(r);
      await reload();
      setLoading(false);
    }

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setFSlug("");
    setFTitle("");
    setFDesc("");
    setFBenefitType("custom");
    setFBenefitValue("");
    setFCurrency("ARS");
    setFConditions("");
    setFExpires("30");
    setFEnabled(true);
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(v: VoucherType) {
    setEditing(v);
    setFSlug(v.slug || "");
    setFTitle(v.title || "");
    setFDesc(v.description || "");
    setFBenefitType(v.benefit_type || "custom");
    setFBenefitValue(v.benefit_value == null ? "" : String(v.benefit_value));
    setFCurrency(v.currency || "ARS");
    setFConditions(v.conditions || "");
    setFExpires(v.expires_in_days == null ? "" : String(v.expires_in_days));
    setFEnabled(!!v.enabled);
    setOpen(true);
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function reload() {
    setErr(null);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Sesión inválida. Relogueá.");
        return;
      }

      const r = await fetch("/api/admin/voucher-types", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = (await r.json().catch(() => null)) as ApiListResp | null;
      if (!r.ok || !j?.ok) {
        setErr((j as any)?.error || "No se pudo cargar.");
        return;
      }

      setRows(Array.isArray(j.rows) ? j.rows : []);
      setCurrentId(j.currentStampsVoucherTypeId || null);
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    }
  }

  async function save() {
    setErr(null);

    const title = String(fTitle || "").trim();
    if (!title) {
      setErr("Title requerido.");
      return;
    }

    let benefitValue: number | null = null;
    if (String(fBenefitValue || "").trim() !== "") {
      const n = Number(fBenefitValue);
      if (Number.isNaN(n)) {
        setErr("benefit_value inválido.");
        return;
      }
      benefitValue = n;
    }

    let expiresInDays: number | null = null;
    if (String(fExpires || "").trim() !== "") {
      const n = Number(fExpires);
      if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) {
        setErr("expires_in_days inválido.");
        return;
      }
      expiresInDays = Math.floor(n);
    }

    const payload = {
      slug: String(fSlug || "").trim() || null,
      title,
      description: String(fDesc || "").trim() || null,
      benefit_type: String(fBenefitType || "custom").trim(),
      benefit_value: benefitValue,
      currency: String(fCurrency || "ARS").trim() || "ARS",
      conditions: String(fConditions || "").trim() || null,
      expires_in_days: expiresInDays,
      enabled: !!fEnabled,
    };

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Sesión inválida. Relogueá.");
        return;
      }

      const isEdit = !!editing?.id;
      const url = isEdit ? `/api/admin/voucher-types/${editing!.id}` : "/api/admin/voucher-types";
      const method = isEdit ? "PATCH" : "POST";

      const r = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setErr(j?.error || "No se pudo guardar.");
        return;
      }

      setOpen(false);
      setEditing(null);
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(v: VoucherType) {
    setErr(null);
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Sesión inválida.");
        return;
      }

      const r = await fetch(`/api/admin/voucher-types/${v.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !v.enabled }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setErr(j?.error || "No se pudo actualizar.");
        return;
      }

      await reload();
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function setAsStampsDefault(v: VoucherType) {
    setErr(null);
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Sesión inválida.");
        return;
      }

      const r = await fetch(`/api/admin/voucher-types/${v.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ setActiveForStamps: true }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setErr(j?.error || "No se pudo setear como default.");
        return;
      }

      await reload();
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10">Cargando...</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Admin / Staff</p>
          <h1 className="text-2xl font-black text-slate-900">Tipos de Voucher (Sellos)</h1>
          <p className="text-xs text-slate-600 mt-1">
            Acá definís el template del voucher. El “Default” es el que se entrega cuando completan sellos.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl px-4 py-3 font-black bg-slate-900 hover:bg-slate-800 text-white"
        >
          + Nuevo
        </button>
      </div>

      {err && (
        <div className="mt-4 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {err}
        </div>
      )}

      <div className="mt-4 bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-12 bg-slate-50 text-slate-600 text-[11px] font-black uppercase px-3 py-2">
              <div className="col-span-4">Título</div>
              <div className="col-span-2">Beneficio</div>
              <div className="col-span-2">Vence</div>
              <div className="col-span-2">Default</div>
              <div className="col-span-2 text-right">Acciones</div>
            </div>

            <div className="divide-y divide-slate-200">
              {rows.length === 0 ? (
                <div className="p-4 text-sm font-bold text-slate-600">Sin tipos aún.</div>
              ) : (
                rows.map((v) => {
                  const isDefault = currentId === v.id;
                  const benefit =
                    v.benefit_type === "fixed_amount"
                      ? `$${v.benefit_value ?? 0}`
                      : v.benefit_type === "percent"
                      ? `${v.benefit_value ?? 0}%`
                      : v.benefit_type === "free_item"
                      ? `FREE`
                      : "custom";

                  return (
                    <div key={v.id} className="grid grid-cols-12 px-3 py-3 text-sm items-center">
                      <div className="col-span-4">
                        <div className="font-black text-slate-900 flex items-center gap-2">
                          {v.title}
                          {!v.enabled && (
                            <span className="text-[11px] font-black px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                              OFF
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {v.slug ? <span className="font-mono">{v.slug}</span> : <span className="italic">sin slug</span>}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <div className="font-black text-slate-900">{benefit}</div>
                        <div className="text-xs text-slate-600">{v.currency || "ARS"}</div>
                      </div>

                      <div className="col-span-2">
                        <div className="font-black text-slate-900">
                          {v.expires_in_days == null ? "—" : `${v.expires_in_days} días`}
                        </div>
                      </div>

                      <div className="col-span-2">
                        {isDefault ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200">
                            DEFAULT
                          </span>
                        ) : (
                          <button
                            disabled={saving || !v.enabled}
                            onClick={() => setAsStampsDefault(v)}
                            className={cls(
                              "rounded-xl px-3 py-2 font-black text-xs border",
                              v.enabled
                                ? "bg-white hover:bg-slate-50 text-slate-900 border-slate-200"
                                : "bg-slate-100 text-slate-400 border-slate-200"
                            )}
                          >
                            Set default
                          </button>
                        )}
                      </div>

                      <div className="col-span-2 flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(v)}
                          className="rounded-xl px-3 py-2 font-black text-xs bg-slate-100 hover:bg-slate-200 text-slate-900"
                        >
                          Editar
                        </button>
                        <button
                          disabled={saving}
                          onClick={() => toggleEnabled(v)}
                          className={cls(
                            "rounded-xl px-3 py-2 font-black text-xs border",
                            v.enabled
                              ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                          )}
                        >
                          {v.enabled ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-slate-200 flex justify-between items-center">
          <button
            onClick={reload}
            disabled={saving}
            className="rounded-xl px-4 py-2 font-black bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60"
          >
            Refrescar
          </button>
          <p className="text-[11px] text-slate-500">Ruta: /admin/voucher-types</p>
        </div>
      </div>

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white">
              <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                {editing ? "Editar tipo" : "Nuevo tipo"}
              </p>
              <h3 className="text-lg font-black">
                {editing ? editing.title : "Crear template"}
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Slug (opcional)</label>
                  <input
                    value={fSlug}
                    onChange={(e) => setFSlug(e.target.value)}
                    placeholder="sellos-default"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Enabled</label>
                  <select
                    value={fEnabled ? "1" : "0"}
                    onChange={(e) => setFEnabled(e.target.value === "1")}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="1">ON</option>
                    <option value="0">OFF</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Title</label>
                <input
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  placeholder="Voucher por Sellos"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Descripción</label>
                <textarea
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  rows={2}
                  placeholder="Texto breve del voucher."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Benefit type</label>
                  <select
                    value={fBenefitType}
                    onChange={(e) => setFBenefitType(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="custom">custom</option>
                    <option value="fixed_amount">fixed_amount</option>
                    <option value="percent">percent</option>
                    <option value="free_item">free_item</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Benefit value</label>
                  <input
                    value={fBenefitValue}
                    onChange={(e) => setFBenefitValue(e.target.value)}
                    placeholder="3000 o 20"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Currency</label>
                  <input
                    value={fCurrency}
                    onChange={(e) => setFCurrency(e.target.value)}
                    placeholder="ARS"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Vence (días)</label>
                  <input
                    value={fExpires}
                    onChange={(e) => setFExpires(e.target.value)}
                    placeholder="30"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Condiciones</label>
                  <input
                    value={fConditions}
                    onChange={(e) => setFConditions(e.target.value)}
                    placeholder="No acumulable, válido en el local..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="w-full sm:w-auto rounded-xl px-4 py-3 font-black bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                >
                  {saving ? "..." : "Guardar"}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setEditing(null);
                  }}
                  className="w-full sm:w-auto rounded-xl px-4 py-3 font-black bg-slate-100 hover:bg-slate-200 text-slate-900"
                >
                  Cancelar
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                Tip: si benefit_type es <b>custom</b>, benefit_value puede quedar vacío.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
