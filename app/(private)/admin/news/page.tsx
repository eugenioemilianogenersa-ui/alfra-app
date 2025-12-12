export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AdminNewsClient from "./AdminNewsClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Cargando noticias...</div>}>
      <AdminNewsClient />
    </Suspense>
  );
}
