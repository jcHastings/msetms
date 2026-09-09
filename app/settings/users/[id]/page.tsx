import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditUserSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  redirect(`/users/${id}`);
}
