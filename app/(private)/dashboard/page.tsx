export const dynamic = "force-dynamic";

import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50">Cargando...</div>}>
      <DashboardClient />
    </Suspense>
  );
}
