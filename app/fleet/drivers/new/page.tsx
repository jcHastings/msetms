import Link from "next/link";
import { DriverForm } from "@/components/driver-form";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function NewDriverPage() {
  return (
    <>
      <PageHeader
        title="Add driver"
        actions={
          <Link href="/fleet/drivers" className="btn btn-secondary">
            Cancel
          </Link>
        }
      />
      <DriverForm submitLabel="Save" />
    </>
  );
}
