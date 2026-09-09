import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BillsPage() {
  redirect("/accounting/invoices?tab=bills");
}
