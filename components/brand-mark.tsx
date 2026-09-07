export function BrandMark({
  variant = "light",
  size = "md",
}: {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}) {
  const height = size === "lg" ? "h-16" : size === "sm" ? "h-10" : "h-12";
  const dark = variant === "dark";
  const nameClass = dark
    ? "text-sm font-semibold tracking-tight text-white"
    : "text-sm font-semibold tracking-tight text-slate-800";
  return (
    <div className={`brand-mark flex flex-col items-start gap-2 ${dark ? "brand-mark-on-dark" : ""}`} data-brand-lockup="">
      <span className={dark ? "brand-mark-chip" : undefined} data-brand-mark-chip={dark ? "" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dark ? "/ms-express-logo.png" : "/api/company/logo"}
          alt="MS Express"
          className={`${height} w-auto`}
        />
      </span>
      <div className={nameClass} data-brand-wordmark="">
        MS Express TMS
      </div>
    </div>
  );
}
