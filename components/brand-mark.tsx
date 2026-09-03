export function BrandMark({
  variant = "light",
  size = "md",
}: {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}) {
  const height = size === "lg" ? "h-16" : size === "sm" ? "h-10" : "h-12";
  const nameClass =
    variant === "dark"
      ? "text-sm font-semibold tracking-tight text-white"
      : "text-sm font-semibold tracking-tight text-slate-800";
  return (
    <div className={`brand-mark flex flex-col items-start gap-2 ${variant === "dark" ? "brand-mark-on-dark" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variant === "dark" ? "/ms-express-logo-on-dark.png" : "/api/company/logo"}
        alt="MS Express"
        className={`${height} w-auto`}
      />
      <div className={nameClass}>MS Express TMS</div>
    </div>
  );
}
