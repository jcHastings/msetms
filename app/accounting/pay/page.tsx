import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DriverPayPage() {
  redirect("/accounting/invoices?tab=pay");
}
