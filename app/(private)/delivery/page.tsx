export const dynamic = "force-dynamic";

import { Suspense } from "react";
import DeliveryClient from "./DeliveryClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Cargando...</div>}>
      <DeliveryClient />
    </Suspense>
  );
}
