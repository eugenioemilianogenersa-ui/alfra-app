"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type UserPoints = {
  id: string;
  display_name: string;
  email: string;
  points: number;
};

type HistoryEvent = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
  metadata?: any;
};

export default function AdminPuntosClient() {
  const supabase = createClient();
  const [data, setData] = useState<UserPoints[]>([]);
  const [search, setSearch] = useState("");

  const [selectedUser, setSelectedUser] = useState<UserPoints | null>(null);
  const [userHistory, setUserHistory] = useState<HistoryEvent[]>([]);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUser) loadHistory(selectedUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function loadData() {
    const token = await getToken();

    const r = await fetch("/api/admin/loyalty/list-users", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const json = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      console.error("list-users error:", (json as any)?.error || r.status);
      setData([]);
      return;
    }

    setData(((json as any).users || []) as UserPoints[]);
  }

  async function loadHistory(userId: string) {
    const { data } = await supabase
      .from("loyalty_events")
      .select("id, delta, reason, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (data) setUserHistory(data as any);
    else setUserHistory([]);
  }

  async function handleTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;

    const delta = parseInt(amount, 10);
    if (!Number.isFinite(delta) || delta === 0) return alert("Monto inválido");
    if (!reason.trim()) return alert("Motivo obligatorio");

    const token = await getToken();

    const r = await fetch("/api/loyalty/adjust-points", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        userId: selectedUser.id,
        delta,
        reason: reason.trim(),
        source: "panel_puntos",
      }),
    });

    const json = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      alert((json as any)?.error || `Error ${r.status}`);
      return;
    }

    await fetch("/api/push/notify-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selectedUser.id,
        delta,
        reason: reason.trim(),
      }),
    });

    setSelectedUser(null);
    setAmount("");
    setReason("");
    await loadData();
  }

  const filtered = data.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">💎 Gestión de Puntos</h1>

      <input
        placeholder="Buscar usuario..."
        className="w-full p-3 border rounded-lg shadow-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <div className="overflow-x-auto">
          {/* ✅ min-width SOLO en mobile, en md+ vuelve a full */}
          <table className="w-full text-sm text-left min-w-[720px] md:min-w-full">
            <thead className="bg-slate-50 uppercase text-xs text-slate-600">
              <tr>
                <th className="p-4">Usuario</th>
                <th className="p-4 text-right whitespace-nowrap">Saldo Actual</th>
                <th className="p-4 text-center whitespace-nowrap">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <p className="font-bold">{u.display_name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="p-4 text-right">
                    <span className={`font-bold text-lg ${u.points > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                      {u.points} pts
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-200 transition"
                    >
                      ⚖️ Ver / Ajustar
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-500">
                    No hay datos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          {/* ✅ Modal más “completo” en PC */}
          <div className="bg-white rounded-xl w-full max-w-lg md:max-w-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold">Ajustar Puntos: {selectedUser.display_name}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-6 grid gap-6 overflow-y-auto pb-safe">
              <form onSubmit={handleTransaction} className="space-y-4 border-b pb-6">
                {/* ✅ en PC se ve “ancho y limpio” */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase block mb-1">Monto</label>
                    <input
                      type="number"
                      autoFocus
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full border p-2 rounded bg-slate-50"
                      placeholder="+100 / -50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase block mb-1">Motivo</label>
                    <input
                      type="text"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full border p-2 rounded bg-slate-50"
                      placeholder="Obligatorio"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 transition"
                >
                  Confirmar Transacción
                </button>
              </form>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Últimos 10 Movimientos</h4>
                <div className="bg-slate-50 rounded-lg border overflow-hidden">
                  {userHistory.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-3">Sin movimientos previos.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      {/* ✅ min-width SOLO en mobile */}
                      <table className="w-full text-xs min-w-[560px] md:min-w-full">
                        <tbody className="divide-y">
                          {userHistory.map((h) => (
                            <tr key={h.id}>
                              <td className="p-2 text-slate-500 whitespace-nowrap">
                                {new Date(h.created_at).toLocaleString()}
                              </td>
                              <td className="p-2 text-slate-800">{h.reason}</td>
                              <td className="p-2 text-slate-500 whitespace-nowrap">
                                {h.metadata?.actor_role ? `${h.metadata.actor_role}` : ""}
                              </td>
                              <td
                                className={`p-2 text-right font-bold whitespace-nowrap ${
                                  h.delta > 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {h.delta > 0 ? `+${h.delta}` : h.delta}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
