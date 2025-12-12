"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  locality: string | null;
  province: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return "";

  if (digits.startsWith("549")) digits = digits.slice(3);
  else if (digits.startsWith("54") && digits.length > 10) digits = digits.slice(2);

  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

export default function PerfilClient() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [locality, setLocality] = useState("");
  const [province, setProvince] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

      const unified: Profile = {
        id: user.id,
        email: user.email ?? null,
        display_name: profileData?.display_name ?? "",
        phone: profileData?.phone ?? "",
        phone_normalized: profileData?.phone_normalized ?? "",
        locality: profileData?.locality ?? "",
        province: profileData?.province ?? "",
        avatar_url: profileData?.avatar_url ?? "",
        created_at: (profileData?.created_at as string | undefined) ?? user.created_at ?? null,
      };

      setProfile(unified);

      setDisplayName(unified.display_name ?? "");
      setPhone(unified.phone ?? "");
      setLocality(unified.locality ?? "");
      setProvince(unified.province ?? "");
      setAvatarUrl(unified.avatar_url ?? "");

      setLoading(false);
    }

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setSaveMsg("");

    const rawPhone = phone.trim();
    const cleanPhone = rawPhone.replace(/[^0-9+]/g, "");
    const normalized = normalizePhone(rawPhone);

    if (!normalized) {
      setSaving(false);
      setSaveMsg("❌ El teléfono es obligatorio.");
      return;
    }

    const updates: any = {
      id: profile.id,
      display_name: displayName.trim() || null,
      phone: cleanPhone || null,
      phone_normalized: normalized,
      locality: locality.trim() || null,
      province: province.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    };

    const { error } = await supabase.from("profiles").upsert(updates);

    setSaving(false);

    if (error) {
      console.error(error);
      setSaveMsg("❌ Error al guardar los cambios.");
      return;
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            display_name: updates.display_name,
            phone: cleanPhone,
            phone_normalized: normalized,
            locality: updates.locality,
            province: updates.province,
            avatar_url: updates.avatar_url,
          }
        : null
    );

    setSaveMsg("✅ Datos actualizados correctamente.");
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Cargando perfil…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">No hay sesión activa.</p>
      </div>
    );
  }

  const hasPhone = !!(profile.phone_normalized || phone);

  return (
    <div className="p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tu perfil</h1>
        <p className="text-sm text-slate-500">Datos de tu cuenta en AlFra.</p>
      </div>

      {!hasPhone && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 animate-pulse">
          <div className="text-2xl">📱</div>
          <div>
            <h3 className="font-bold text-amber-800 text-sm">Vinculá tus pedidos</h3>
            <p className="text-xs text-amber-700 mt-1">
              Ingresá tu celular para que tus pedidos de Fudo aparezcan automáticamente en la app y puedas ver el tracking en vivo.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover border" />
            </>
          ) : (
            <div className="h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
              <span className="text-lg">👤</span>
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-slate-800">{displayName || "Sin nombre"}</p>
            <p className="text-sm text-slate-500">{profile.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500">Nombre / alias</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="Ej: Cliente Alfra"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 flex justify-between">
              Teléfono
              {!hasPhone && <span className="text-red-500 text-[10px] uppercase tracking-wider">Requerido</span>}
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 ${
                !hasPhone ? "border-amber-300 bg-amber-50" : ""
              }`}
              placeholder="Ej: 3581234567"
            />
            <p className="text-[10px] text-slate-400 mt-1">Podés escribirlo con o sin +54 9, lo normalizamos automáticamente.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">Localidad</label>
            <input
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="Coronel Moldes"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">Provincia</label>
            <input
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="Córdoba"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-500">URL de avatar (opcional)</label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="https://..."
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 shadow-md transition-transform active:scale-95"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            {saveMsg && (
              <p className={`text-xs font-medium ${saveMsg.includes("Error") ? "text-red-600" : "text-green-600"}`}>
                {saveMsg}
              </p>
            )}
          </div>
        </form>

        <div className="grid grid-cols-2 gap-4 text-sm text-slate-700 pt-2 border-t mt-4">
          <div>
            <p className="text-xs text-slate-400 uppercase">Miembro desde</p>
            <p className="font-mono text-xs">
              {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3 max-w-3xl">
        <h2 className="text-sm font-semibold text-slate-900">Seguridad</h2>
        <p className="text-xs text-slate-500">Podés recuperar tu contraseña desde acá.</p>
        <Link
          href="/recuperar"
          className="inline-flex items-center gap-1 rounded-md bg-white border border-emerald-600 text-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-50"
        >
          Cambiar / recuperar contraseña
        </Link>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3 max-w-3xl">
        <h2 className="text-sm font-semibold text-slate-900">Cuenta</h2>
        <p className="text-xs text-slate-500">Cerrar sesión en este dispositivo.</p>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1 rounded-md bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
