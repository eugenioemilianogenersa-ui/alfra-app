export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AdminClient from "./AdminClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Cargando...</div>}>
      <AdminClient />
    </Suspense>
  );
}
