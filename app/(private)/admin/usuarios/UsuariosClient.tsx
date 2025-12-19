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

export default function UsuariosPage() {
  const supabase = createClient();

  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ rol actual
  const [myRole, setMyRole] = useState<"admin" | "staff" | "other">("other");

  // Modales
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  // Form
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    displayName: "",
    phone: "",
    role: "cliente",
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    (async () => {
      await loadMyRole();
      await fetchUsers();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMyRole() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.session.user.id)
      .single();

    const r = String(profile?.role || "").toLowerCase();
    if (r === "admin") setMyRole("admin");
    else if (r === "staff") setMyRole("staff");
    else setMyRole("other");
  }

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      setUsers([]);
    } else if (data) {
      setUsers(data as any);
    }
    setLoading(false);
  }

  const isAdmin = myRole === "admin";
  const isStaff = myRole === "staff";

  // --- ADMIN ONLY ---
  async function handleDeleteUser(userId: string) {
    if (!isAdmin) return alert("Solo ADMIN puede eliminar usuarios.");
    if (!confirm("⚠️ ¿Estás seguro de ELIMINAR este usuario? Esta acción es irreversible.")) return;

    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar");

      alert("✅ Usuario eliminado correctamente.");
      fetchUsers();
    } catch (error: any) {
      alert("❌ No se pudo eliminar: " + error.message);
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return alert("Solo ADMIN puede crear usuarios.");

    setFormLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");

      alert("✅ Usuario creado correctamente");
      setIsCreateOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      alert("❌ Error: " + error.message);
    } finally {
      setFormLoading(false);
    }
  }

  // --- ADMIN o STAFF: editar SOLO nombre/teléfono via endpoint seguro ---
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setFormLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const res = await fetch("/api/profiles/update-basic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: editingUser.id,
          display_name: formData.displayName,
          phone: formData.phone,
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);

      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      alert("❌ Error al actualizar: " + error.message);
    } finally {
      setFormLoading(false);
    }
  }

  // --- HELPERS ---
  function openCreateModal() {
    if (!isAdmin) return alert("Solo ADMIN puede crear usuarios.");
    resetForm();
    setIsCreateOpen(true);
  }

  function openEditModal(u: Profile) {
    setFormData({
      email: u.email || "",
      password: "",
      displayName: u.display_name || "",
      phone: u.phone || "",
      role: u.role || "cliente",
    });
    setEditingUser(u);
  }

  function resetForm() {
    setFormData({ email: "", password: "", displayName: "", phone: "", role: "cliente" });
  }

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search)
  );

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando usuarios...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">👥 Gestión de Usuarios</h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "Administra clientes, repartidores, staff y admins."
              : isStaff
                ? "Podés ver/buscar usuarios y editar nombre/teléfono."
                : "Acceso limitado."}
          </p>
        </div>

        {/* ✅ SOLO ADMIN ve crear */}
        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-black transition flex items-center gap-2 shadow-lg"
          >
            <span>+</span> Nuevo Usuario
          </button>
        )}
      </div>

      {/* BUSCADOR */}
      <div className="relative">
        <span className="absolute left-3 top-3 text-slate-400">🔍</span>
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          className="w-full pl-10 p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-slate-200 outline-none"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-xs border-b">
            <tr>
              <th className="p-4">Usuario</th>
              <th className="p-4">Rol</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <p className="font-bold text-slate-800 text-base">{u.display_name || "Sin nombre"}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                  <p className="text-xs text-emerald-600 font-mono mt-0.5">📞 {u.phone || "Sin tel"}</p>
                </td>

                <td className="p-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold uppercase border
                    ${
                      u.role === "admin"
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : u.role === "delivery"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : u.role === "staff"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    {u.role || "CLIENTE"}
                  </span>
                </td>

                <td className="p-4 text-right space-x-2">
                  <button
                    onClick={() => openEditModal(u)}
                    className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-50 font-medium transition"
                  >
                    ✏️ Editar
                  </button>

                  {/* ✅ SOLO ADMIN ve eliminar */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded hover:bg-red-100 font-medium transition"
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && <div className="p-8 text-center text-slate-400">No se encontraron usuarios.</div>}
      </div>

      {/* --- MODAL CREAR USUARIO (SOLO ADMIN) --- */}
      {isCreateOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold">Crear Nuevo Usuario</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                <input
                  type="email"
                  required
                  className="w-full border p-2 rounded"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full border p-2 rounded"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                  <input
                    type="text"
                    required
                    className="w-full border p-2 rounded"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                  <input
                    type="text"
                    required
                    className="w-full border p-2 rounded"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="358..."
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Rol</label>
                <select
                  className="w-full border p-2 rounded bg-white"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="cliente">Cliente</option>
                  <option value="delivery">Delivery</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-emerald-600 text-white py-3 rounded font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                {formLoading ? "Creando..." : "Crear Usuario"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL EDITAR USUARIO (ADMIN/STAFF) --- */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold">Editar Usuario</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded border text-sm text-slate-500">
                Editando a: <b>{formData.email}</b>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                  <input
                    type="text"
                    required
                    className="w-full border p-2 rounded"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                  <input
                    type="text"
                    required
                    className="w-full border p-2 rounded"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              {/* ✅ SOLO ADMIN ve rol (pero igual NO lo actualizamos por endpoint) */}
              {isAdmin && (
                <div className="p-3 rounded border bg-amber-50 text-amber-900 text-xs">
                  Nota: el rol se gestiona solo por ADMIN desde tu flujo actual (no por este submit).
                </div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {formLoading ? "Guardando..." : "Guardar Cambios"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
