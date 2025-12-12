export const dynamic = "force-dynamic";

import { Suspense } from "react";
import MisPedidosClient from "./MisPedidosClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Cargando mis pedidos...</div>}>
      <MisPedidosClient />
    </Suspense>
  );
}
