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
  id: number;
  delta: number;
  reason: string;
  created_at: string;
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

  async function loadData() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email");
    const { data: wallets } = await supabase
      .from("loyalty_wallets")
      .select("user_id, points");

    if (profiles) {
      const mapped = profiles.map((p: any) => {
        const w = wallets?.find((wallet: any) => wallet.user_id === p.id);
        return {
          id: p.id,
          display_name: p.display_name || "Sin nombre",
          email: p.email || "",
          points: w?.points || 0,
        };
      });

      setData(mapped.sort((a, b) => b.points - a.points));
    }
  }

  async function loadHistory(userId: string) {
    const { data } = await supabase
      .from("loyalty_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (data) setUserHistory(data as any);
  }

  async function handleTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;

    const delta = parseInt(amount);
    if (!delta) return alert("Monto inválido");

    const newTotal = selectedUser.points + delta;

    await supabase.from("loyalty_wallets").upsert({
      user_id: selectedUser.id,
      points: newTotal,
      updated_at: new Date().toISOString(),
    });

    await supabase.from("loyalty_events").insert({
      user_id: selectedUser.id,
      delta: delta,
      reason: reason || "Ajuste Admin",
      metadata: { source: "admin_puntos" },
    });

    setSelectedUser(null);
    setAmount("");
    setReason("");
    loadData();
  }

  const filtered = data.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">💎 Gestión de Puntos</h1>

      <input
        placeholder="Buscar usuario..."
        className="w-full p-3 border rounded-lg shadow-sm"
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 uppercase text-xs text-slate-600">
            <tr>
              <th className="p-4">Usuario</th>
              <th className="p-4 text-right">Saldo Actual</th>
              <th className="p-4 text-center">Acción</th>
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
                  <span
                    className={`font-bold text-lg ${
                      u.points > 0 ? "text-emerald-600" : "text-slate-400"
                    }`}
                  >
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
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold">
                Ajustar Puntos: {selectedUser.display_name}
              </h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 grid gap-6">
              <form
                onSubmit={handleTransaction}
                className="space-y-4 border-b pb-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase block mb-1">
                      Monto
                    </label>
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
                    <label className="text-xs font-bold uppercase block mb-1">
                      Motivo
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full border p-2 rounded bg-slate-50"
                      placeholder="Razón..."
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
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                  Últimos 5 Movimientos
                </h4>
                <div className="bg-slate-50 rounded-lg border overflow-hidden">
                  {userHistory.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-3">
                      Sin movimientos previos.
                    </p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody className="divide-y">
                        {userHistory.map((h) => (
                          <tr key={h.id}>
                            <td className="p-2 text-slate-500">
                              {new Date(h.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-2 text-slate-800">{h.reason}</td>
                            <td
                              className={`p-2 text-right font-bold ${
                                h.delta > 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {h.delta > 0 ? `+${h.delta}` : h.delta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
