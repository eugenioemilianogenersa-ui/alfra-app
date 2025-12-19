"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
};

export default function UsuariosClient() {
  const supabase = createClient();

  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<"admin" | "staff" | "cliente">("cliente");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    displayName: "",
    phone: "",
    role: "cliente",
  });

  useEffect(() => {
    init();
    // eslint-disable-next-line
  }, []);

  async function init() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: role } = await supabase.rpc("get_my_role");
    setMyRole((role || "cliente").toLowerCase());

    await fetchUsers();
    setLoading(false);
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function fetchUsers() {
    const token = await getToken();
    const r = await fetch("/api/admin/profiles/list", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const json = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      console.error("profiles/list:", json?.error || r.status);
      setUsers([]);
      return;
    }

    setUsers((json as any).profiles || []);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setFormLoading(true);
    try {
      const token = await getToken();

      const payload: any = {
        userId: editingUser.id,
        display_name: formData.displayName,
        phone: formData.phone,
      };

      if (myRole === "admin") payload.role = formData.role;

      const r = await fetch("/api/admin/profiles/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error((json as any)?.error || `HTTP ${r.status}`);

      setEditingUser(null);
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || "Error");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (myRole !== "admin") return;

    setFormLoading(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          displayName: formData.displayName,
          phone: formData.phone,
          role: formData.role,
        }),
      });

      const json = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error((json as any)?.error || `HTTP ${r.status}`);

      setIsCreateOpen(false);
      setFormData({ email: "", password: "", displayName: "", phone: "", role: "cliente" });
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || "Error al crear");
    } finally {
      setFormLoading(false);
    }
  }

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search)
  );

  if (loading) return <div className="p-6">Cargando usuarios...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">👥 Gestión de Usuarios</h1>

        {myRole === "admin" && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded"
          >
            + Nuevo Usuario
          </button>
        )}
      </div>

      <input
        placeholder="Buscar usuario..."
        className="w-full border p-2 rounded"
        onChange={(e) => setSearch(e.target.value)}
      />

      <table className="w-full border bg-white">
        <thead>
          <tr className="border-b">
            <th className="p-2">Usuario</th>
            <th className="p-2">Rol</th>
            <th className="p-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">
                <b>{u.display_name || "Sin nombre"}</b>
                <div className="text-xs">{u.email}</div>
              </td>
              <td className="p-2">{u.role}</td>
              <td className="p-2 text-right">
                <button
                  onClick={() => {
                    setFormData({
                      email: u.email || "",
                      password: "",
                      displayName: u.display_name || "",
                      phone: u.phone || "",
                      role: u.role || "cliente",
                    });
                    setEditingUser(u);
                  }}
                  className="border px-3 py-1 rounded"
                >
                  Editar
                </button>
              </td>
            </tr>
          ))}

          {filtered.length === 0 && (
            <tr>
              <td className="p-4 text-center text-slate-500" colSpan={3}>
                No hay usuarios para mostrar.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* MODAL EDIT */}
      {editingUser && (
        <form onSubmit={handleEditSubmit} className="p-4 border rounded bg-white">
          <h3 className="font-bold mb-2">Editar Usuario</h3>

          <input
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            placeholder="Nombre"
            className="border p-2 w-full mb-2"
          />

          <input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="Teléfono"
            className="border p-2 w-full mb-2"
          />

          {myRole === "admin" && (
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="border p-2 w-full mb-2"
            >
              <option value="cliente">Cliente</option>
              <option value="staff">Staff</option>
              <option value="delivery">Delivery</option>
              <option value="admin">Admin</option>
            </select>
          )}

          <div className="flex gap-2">
            <button
              disabled={formLoading}
              className="bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-60"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="border px-4 py-2 rounded"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* MODAL CREATE */}
      {isCreateOpen && myRole === "admin" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Crear usuario</h3>
              <button onClick={() => setIsCreateOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <input
                className="border p-2 w-full rounded"
                placeholder="Email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />

              <input
                className="border p-2 w-full rounded"
                placeholder="Password"
                type="password"
                minLength={6}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />

              <input
                className="border p-2 w-full rounded"
                placeholder="Nombre"
                required
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />

              <input
                className="border p-2 w-full rounded"
                placeholder="Teléfono"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />

              <select
                className="border p-2 w-full rounded"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="cliente">Cliente</option>
                <option value="staff">Staff</option>
                <option value="delivery">Delivery</option>
                <option value="admin">Admin</option>
              </select>

              <button
                disabled={formLoading}
                className="bg-slate-900 text-white w-full py-2 rounded disabled:opacity-60"
              >
                {formLoading ? "Creando..." : "Crear"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
