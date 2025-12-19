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

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    displayName: "",
    phone: "",
    role: "cliente",
  });

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: role } = await supabase.rpc("get_my_role");
    setMyRole((role || "cliente").toLowerCase());

    await fetchUsers();
    setLoading(false);
  }

  async function fetchUsers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchUsers error:", error.message);
      setUsers([]);
      return;
    }

    setUsers(data || []);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    const updateData: any = {
      display_name: formData.displayName,
      phone: formData.phone,
    };

    // SOLO ADMIN puede cambiar rol
    if (myRole === "admin") {
      updateData.role = formData.role;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", editingUser.id);

    if (error) alert(error.message);
    else {
      setEditingUser(null);
      fetchUsers();
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
        </tbody>
      </table>

      {editingUser && (
        <form onSubmit={handleEditSubmit} className="p-4 border rounded bg-white">
          <h3 className="font-bold mb-2">Editar Usuario</h3>

          <input
            value={formData.displayName}
            onChange={(e) =>
              setFormData({ ...formData, displayName: e.target.value })
            }
            placeholder="Nombre"
            className="border p-2 w-full mb-2"
          />

          <input
            value={formData.phone}
            onChange={(e) =>
              setFormData({ ...formData, phone: e.target.value })
            }
            placeholder="Teléfono"
            className="border p-2 w-full mb-2"
          />

          {myRole === "admin" && (
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value })
              }
              className="border p-2 w-full mb-2"
            >
              <option value="cliente">Cliente</option>
              <option value="staff">Staff</option>
              <option value="delivery">Delivery</option>
              <option value="admin">Admin</option>
            </select>
          )}

          <button className="bg-emerald-600 text-white px-4 py-2 rounded">
            Guardar
          </button>
        </form>
      )}
    </div>
  );
}
