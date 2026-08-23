import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TrailerForm } from "@/components/trailer-form";
import { createTrailerAction } from "@/lib/actions";

export default function NewTrailerPage() {
  return (
    <>
      <PageHeader
        title="Add trailer"
        actions={
          <Link href="/fleet" className="btn btn-secondary">
            Back to fleet
          </Link>
        }
      />
      <TrailerForm action={createTrailerAction} submitLabel="Create trailer" />
    </>
  );
}
