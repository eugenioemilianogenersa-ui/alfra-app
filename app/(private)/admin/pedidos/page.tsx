export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AdminPedidosClient from "./AdminPedidosClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-slate-500">
          Cargando pedidos...
        </div>
      }
    >
      <AdminPedidosClient />
    </Suspense>
  );
}
