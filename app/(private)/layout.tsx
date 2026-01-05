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

  // Gate TEL
  const [phoneGateChecking, setPhoneGateChecking] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);

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

      // ✅ FIX CLAVE: "user" debe comportarse como "cliente"
      const r = String(role || "cliente").toLowerCase();
      setUserRole(r === "user" ? "cliente" : r);

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
  "/voucher",
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
  "/voucher",
  "/mis-pedidos",
  "/puntos",
  "/perfil",
  "/delivery",
],

    } as const;
  }, []);

  // Guard por roles no-panel
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

  // ✅ Gate TEL por RPC (no depende de RLS)
  useEffect(() => {
    async function runPhoneGate() {
      if (checking) return;
      if (!userRole) return;

      const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
      const isStaffPanel = userRole === "staff";
      const isDelivery = userRole === "delivery";

      // No bloquear panel admin/staff ni delivery
      if (isAdminPanel || isStaffPanel || isDelivery) {
        setNeedsPhone(false);
        setPhoneGateChecking(false);
        return;
      }

      const isAdminPreview = userRole === "admin" && searchParams.get("preview") === "true";
      const isCliente = userRole === "cliente" || isAdminPreview;

      if (!isCliente) {
        setNeedsPhone(false);
        setPhoneGateChecking(false);
        return;
      }

      // /perfil siempre permitido
      if (pathname === "/perfil" || pathname.startsWith("/perfil/")) {
        const { data: need } = await supabase.rpc("get_my_phone_required");
        setNeedsPhone(Boolean(need));
        setPhoneGateChecking(false);
        return;
      }

      const { data: need, error } = await supabase.rpc("get_my_phone_required");

      // Si hay error, por seguridad bloqueamos igual
      if (error) {
        console.warn("get_my_phone_required error:", error.message);
        router.replace("/perfil?required_phone=1");
        return;
      }

      const must = Boolean(need);
      setNeedsPhone(must);
      setPhoneGateChecking(false);

      if (must) {
        router.replace("/perfil?required_phone=1");
      }
    }

    runPhoneGate();
  }, [checking, userRole, pathname, searchParams, router, supabase]);

  if (checking || phoneGateChecking) {
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

        {needsPhone && (pathname === "/perfil" || pathname.startsWith("/perfil/")) && (
          <div className="max-w-3xl mx-auto px-6">
            <div className="mt-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Para activar seguimiento de pedidos y beneficios, cargá tu celular y guardá los cambios.
            </div>
          </div>
        )}

        <main className="min-h-full pt-6">{children}</main>
        <BottomNav role={userRole} />
      </div>
    </>
  );
}
