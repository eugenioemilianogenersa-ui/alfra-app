"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PushNotifications from "@/components/PushNotifications";
import ChatbaseRouteGuard from "@/components/ChatbaseRouteGuard";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [phoneGateChecking, setPhoneGateChecking] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const { data: role, error } = await supabase.rpc("get_my_role");
      if (error) {
        console.error("get_my_role error:", error.message);
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const r = String(role || "cliente").toLowerCase();
      setUserRole(r === "user" ? "cliente" : r);

      setChecking(false);
    }

    checkSession();
  }, [router, supabase]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const allowedByRole = useMemo(() => {
    return {
      delivery: ["/delivery", "/perfil"],
      cliente: [
        "/dashboard",
        "/ayuda",
        "/carta",
        "/choperas",
        "/beneficios",
        "/voucher",
        "/mis-pedidos",
        "/puntos",
        "/perfil",
      ],
      staff: ["/admin", "/admin/usuarios", "/admin/puntos", "/admin/pedidos", "/admin/sellos", "/admin/vouchers"],
      adminPreview: [
        "/dashboard",
        "/ayuda",
        "/carta",
        "/choperas",
        "/beneficios",
        "/voucher",
        "/mis-pedidos",
        "/puntos",
        "/perfil",
        "/delivery",
      ],
    } as const;
  }, []);

  useEffect(() => {
    if (checking) return;
    if (!userRole) return;

    const isAdminPreview = userRole === "admin" && searchParams.get("preview") === "true";
    const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
    const isStaffPanel = userRole === "staff";
    if (isAdminPanel || isStaffPanel) return;

    const roleKey = isAdminPreview ? "adminPreview" : (userRole as "delivery" | "cliente");
    const allowed = (allowedByRole as any)[roleKey] ?? allowedByRole.cliente;

    const isAllowed = allowed.some((base: string) => pathname === base || pathname.startsWith(base + "/"));
    if (!isAllowed) {
      const fallback = roleKey === "delivery" ? "/delivery" : "/dashboard";
      router.replace(fallback);
    }
  }, [checking, userRole, pathname, searchParams, router, allowedByRole]);

  useEffect(() => {
    async function runPhoneGate() {
      if (checking) return;
      if (!userRole) return;

      const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
      const isStaffPanel = userRole === "staff";
      const isDelivery = userRole === "delivery";

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

      if (pathname === "/perfil" || pathname.startsWith("/perfil/")) {
        const { data: need } = await supabase.rpc("get_my_phone_required");
        setNeedsPhone(Boolean(need));
        setPhoneGateChecking(false);
        return;
      }

      const { data: need, error } = await supabase.rpc("get_my_phone_required");
      if (error) {
        console.warn("get_my_phone_required error:", error.message);
        router.replace("/perfil?required_phone=1");
        return;
      }

      const must = Boolean(need);
      setNeedsPhone(must);
      setPhoneGateChecking(false);

      if (must) router.replace("/perfil?required_phone=1");
    }

    runPhoneGate();
  }, [checking, userRole, pathname, searchParams, router, supabase]);

  if (checking || phoneGateChecking) {
    return <div className="min-h-dvh flex items-center justify-center bg-slate-100">Cargando...</div>;
  }

  const isAdminPanel = userRole === "admin" && searchParams.get("preview") !== "true";
  const isStaffPanel = userRole === "staff";
  const isAdminPreview = userRole === "admin" && searchParams.get("preview") === "true";

  // ADMIN/STAFF
  if (isAdminPanel || isStaffPanel) {
    return (
      <>
        <PushNotifications />
        <div className="flex h-dvh w-full overflow-hidden bg-slate-100">
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} role={userRole} />

          <div className="flex flex-1 flex-col h-full w-full min-w-0 relative">
            <header className="lg:hidden h-16 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 shadow-md z-30">
              <span className="font-bold tracking-wide">{isAdminPanel ? "PANEL ADMIN" : "PANEL STAFF"}</span>
              <button onClick={() => setMenuOpen(true)} className="p-2 rounded-md hover:bg-white/10">
                ☰
              </button>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-safe">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
      </>
    );
  }

  // CLIENTE/DELIVERY
  return (
    <>
      <PushNotifications />

      {/* ✅ Controla que Chatbase SOLO se vea en /ayuda */}
      <ChatbaseRouteGuard />

      <div className="min-h-dvh bg-slate-50 relative pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {isAdminPreview && (
          <div className="sticky top-0 z-50 bg-amber-200 text-amber-900 text-[10px] text-center py-1 font-bold shadow-sm pt-safe">
            MODO VISTA PREVIA •{" "}
            <a href="/admin" className="underline hover:text-amber-950">
              Volver al Panel
            </a>
          </div>
        )}

        {needsPhone && (pathname === "/perfil" || pathname.startsWith("/perfil/")) && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="mt-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Para activar seguimiento de pedidos y beneficios, cargá tu celular y guardá los cambios.
            </div>
          </div>
        )}

        <main className="min-h-full pt-4 sm:pt-6">{children}</main>
        <BottomNav role={userRole} />
      </div>
    </>
  );
}
