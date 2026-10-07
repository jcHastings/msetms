import { redirect } from "next/navigation";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Bills");
export const dynamic = "force-dynamic";

export default function BillsPage() {
  redirect("/accounting/invoices?tab=bills");
}
