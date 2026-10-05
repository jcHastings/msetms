import { locationIsVerified } from "@/lib/places-shared";

export function LocationVerifyBadge({ verifiedAt }: { verifiedAt?: string | null }) {
  const verified = locationIsVerified({ verified_at: verifiedAt });
  return (
    <span
      className={
        verified
          ? "ml-2 inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
          : "ml-2 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
      }
      data-location-verified={verified ? "1" : "0"}
    >
      {verified ? "Verified" : "Not verified"}
    </span>
  );
}
