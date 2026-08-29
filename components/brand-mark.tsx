export function BrandMark({
  variant = "light",
  size = "md",
}: {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}) {
  const height = size === "lg" ? "h-16" : size === "sm" ? "h-10" : "h-12";
  const nameClass =
    variant === "dark" ? "text-sm font-semibold tracking-tight text-white" : "text-sm font-semibold tracking-tight text-slate-800";
  return (
    <div className="flex flex-col items-start gap-2">
      <div className={variant === "dark" ? "rounded-md bg-white px-2 py-1.5" : ""}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/company/logo" alt="MS Express" className={`${height} w-auto`} />
      </div>
      <div className={nameClass}>MS Express TMS</div>
    </div>
  );
}
