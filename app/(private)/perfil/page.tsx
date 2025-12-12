export const dynamic = "force-dynamic";

import { Suspense } from "react";
import PerfilClient from "./PerfilClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6"><p className="text-sm text-slate-500">Cargando perfil…</p></div>}>
      <PerfilClient />
    </Suspense>
  );
}
