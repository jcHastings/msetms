import Link from "next/link";
import { LocationForm } from "@/components/location-form";
import { PageHeader } from "@/components/page-header";
import { createLocationAction } from "@/lib/actions";

export default function NewLocationPage() {
  return (
    <>
      <PageHeader
        title="New location"
        actions={
          <Link href="/locations" className="btn btn-secondary">
            Back to locations
          </Link>
        }
      />
      <LocationForm action={createLocationAction} submitLabel="Create location" />
    </>
  );
}
