export const dynamic = "force-dynamic";

import { Suspense } from "react";
import FudoPedidosClient from "./FudoPedidosClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Cargando pedidos de Fudo...</div>}>
      <FudoPedidosClient />
    </Suspense>
  );
}
