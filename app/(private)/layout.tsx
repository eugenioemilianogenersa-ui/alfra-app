"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PushNotifications from "@/components/PushNotifications";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Nuevo: gate por teléfono (solo cliente / admin preview)
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [hasPhone, setHasPhone] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      // Rol por RPC (no depende de RLS de profiles)
      const { data: role, error } = await supabase.rpc("get_my_role");
      if (error) {
        console.error("get_my_role error:", error.message);
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setUserRole(String(role || "cliente").toLowerCase());
      setChecking(false);
    }

    checkSession();
  }, [router, supabase]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ✅ Rutas permitidas por rol
  const allowedByRole = useMemo(() => {
    return {
      delivery: ["/delivery", "/perfil"],

      cliente: [
        "/dashboard",
        "/carta",
        "/choperas",
        "/Beneficios",
        "/mis-pedidos",
        "/puntos",
        "/perfil",
      ],

      staff: [
        "/admin",
        "/admin/usuarios",
        "/admin/puntos",
        "/admin/pedidos",
        "/admin/sellos",
        "/admin/vouchers",
      ],

      adminPreview: [
        "/dashboard",
        "/carta",
        "/choperas",
        "/Beneficios",
        "/mis-pedidos",
        "/puntos",
        "/perfil",
        "/delivery",
      ],
    } as const;
  }, []);

  // Guard de rutas por rol (igual que antes)
  useEffect(() => {
    if (checking) return;
    if (!userRole) return;

    const isAdminPreview = userRole === "admin" && searchParams.get("preview") === "true";

    const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
    const isStaffPanel = userRole === "staff";
    if (isAdminPanel || isStaffPanel) return;

    const roleKey = isAdminPreview ? "adminPreview" : (userRole as "delivery" | "cliente");
    const allowed = (allowedByRole as any)[roleKey] ?? allowedByRole.cliente;

    const isAllowed = allowed.some(
      (base: string) => pathname === base || pathname.startsWith(base + "/")
    );

    if (!isAllowed) {
      const fallback = roleKey === "delivery" ? "/delivery" : "/dashboard";
      router.replace(fallback);
    }
  }, [checking, userRole, pathname, searchParams, router, allowedByRole]);

  // ✅ NUEVO: Gate de teléfono para cliente/adminPreview
  useEffect(() => {
    async function checkPhoneGate() {
      if (checking) return;
      if (!userRole) return;

      const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
      const isStaffPanel = userRole === "staff";
      const isDelivery = userRole === "delivery";
      if (isAdminPanel || isStaffPanel || isDelivery) {
        setHasPhone(true);
        setPhoneChecked(true);
        return;
      }

      const isAdminPreview = userRole === "admin" && searchParams.get("preview") === "true";
      const isCliente = userRole === "cliente" || isAdminPreview;

      // Solo aplica a "cliente" (y admin preview como cliente)
      if (!isCliente) {
        setHasPhone(true);
        setPhoneChecked(true);
        return;
      }

      // Permitimos /perfil SIEMPRE (para que pueda cargar teléfono)
      if (pathname === "/perfil" || pathname.startsWith("/perfil/")) {
        setPhoneChecked(true);
        return;
      }

      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) {
          setHasPhone(true);
          setPhoneChecked(true);
          return;
        }

        const { data: p, error } = await supabase
          .from("profiles")
          .select("phone_normalized, phone")
          .eq("id", uid)
          .maybeSingle();

        if (error) {
          console.warn("phone gate: profiles read error:", error.message);
          // si no podemos leer, NO bloqueamos para no romper UX por RLS/momento
          setHasPhone(true);
          setPhoneChecked(true);
          return;
        }

        const ok = !!(p?.phone_normalized || p?.phone);
        setHasPhone(ok);
        setPhoneChecked(true);

        if (!ok) {
          router.replace("/perfil?required_phone=1");
        }
      } catch (e) {
        console.warn("phone gate: unexpected error", e);
        setHasPhone(true);
        setPhoneChecked(true);
      }
    }

    checkPhoneGate();
  }, [checking, userRole, pathname, searchParams, router, supabase]);

  if (checking || !phoneChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        Cargando...
      </div>
    );
  }

  const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
  const isStaffPanel = userRole === "staff";

  if (isAdminPanel || isStaffPanel) {
    return (
      <>
        <PushNotifications />
        <div className="flex h-screen bg-slate-100 overflow-hidden">
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} role={userRole} />
          <div className="flex-1 flex flex-col h-screen relative w-full">
            <div className="lg:hidden p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <span className="font-bold">{isAdminPanel ? "Panel Admin" : "Panel Staff"}</span>
              <button onClick={() => setMenuOpen(true)}>☰</button>
            </div>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PushNotifications />

      <div className="min-h-screen bg-slate-50 relative pb-20">
        {userRole === "admin" && searchParams.get("preview") === "true" && (
          <div className="fixed top-0 left-0 right-0 bg-amber-200 text-amber-900 text-[10px] text-center py-1 z-60 font-bold shadow-sm">
            MODO VISTA PREVIA •{" "}
            <a href="/admin" className="underline">
              Volver al Panel
            </a>
          </div>
        )}

        {/* Banner suave si está sin teléfono y está justo en /perfil */}
        {!hasPhone && (pathname === "/perfil" || pathname.startsWith("/perfil/")) && (
          <div className="max-w-3xl mx-auto px-6">
            <div className="mt-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Para activar el seguimiento de pedidos y beneficios, cargá tu celular y guardá los cambios.
            </div>
          </div>
        )}

        <main className="min-h-full pt-6">{children}</main>
        <BottomNav role={userRole} />
      </div>
    </>
  );
}
