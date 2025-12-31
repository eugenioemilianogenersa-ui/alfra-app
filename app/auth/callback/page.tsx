"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

function Fallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl shadow p-6 w-full max-w-md text-center">
        <div className="text-sm text-slate-700">Procesando autenticación...</div>
        <div className="mt-3 text-xs text-slate-400">ALFRA APP</div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <CallbackClient />
    </Suspense>
  );
}
