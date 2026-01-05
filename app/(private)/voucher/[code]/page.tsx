export const dynamic = "force-dynamic";
export const metadata = { title: "Voucher | AlFra" };

import VoucherClient from "./voucherClient";

export default function VoucherPage({ params }: { params: { code: string } }) {
  return <VoucherClient code={params.code} />;
}
