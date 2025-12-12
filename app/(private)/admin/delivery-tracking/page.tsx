export const dynamic = "force-dynamic";

import { Suspense } from "react";
import DeliveryTrackingAdminClient from "./DeliveryTrackingAdminClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-slate-500">
          Cargando tracking de repartidores...
        </div>
      }
    >
      <DeliveryTrackingAdminClient />
    </Suspense>
  );
}
