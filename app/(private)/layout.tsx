"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PushNotifications from "@/components/PushNotifications"; // 👈 NUEVO

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();
  
  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

      setUserRole(profile?.role || "cliente");
      setChecking(false);
    }
    checkSession();
  }, [router, supabase]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (checking)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        Cargando...
      </div>
    );

  const isAdminView =
    userRole === "admin" && searchParams.get("preview") !== "true";

  if (isAdminView) {
    return (
      <>
        <PushNotifications /> {/* 👈 ACÁ */}
        <div className="flex h-screen bg-slate-100 overflow-hidden">
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
          <div className="flex-1 flex flex-col h-screen relative w-full">
            <div className="lg:hidden p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <span className="font-bold">Panel Admin</span>
              <button onClick={() => setMenuOpen(true)}>☰</button>
            </div>
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PushNotifications /> {/* 👈 ACÁ */}
      <div className="min-h-screen bg-slate-50 relative pb-20">
        {userRole === "admin" && (
          <div className="fixed top-0 left-0 right-0 bg-amber-200 text-amber-900 text-[10px] text-center py-1 z-60 font-bold shadow-sm">
            MODO VISTA PREVIA •{" "}
            <a href="/admin" className="underline">
              Volver al Panel
            </a>
          </div>
        )}

        <main className="min-h-full pt-6">{children}</main>
        <BottomNav role={userRole} />
      </div>
    </>
  );
}
