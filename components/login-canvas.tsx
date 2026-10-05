import { BrandMark } from "@/components/brand-mark";

export function LoginCanvas({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="login-canvas">
      <div className="login-brand">
        <BrandMark variant="dark" size="lg" />
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
