export const dynamic = "force-dynamic";

import { Suspense } from "react";
import VoucherClient from "./voucherClient";

export default function Page({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code || "");

  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Cargando voucher...</div>}>
      <VoucherClient code={code} />
    </Suspense>
  );
}
