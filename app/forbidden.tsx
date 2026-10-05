import { AccessDenied } from "@/components/access-denied";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Access denied");

export default function Forbidden() {
  return <AccessDenied message="This area is not available for your role." />;
}
