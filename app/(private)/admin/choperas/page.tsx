export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AdminChoperasClient from "./AdminChoperasClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-slate-500">
          Cargando choperas...
        </div>
      }
    >
      <AdminChoperasClient />
    </Suspense>
  );
}
