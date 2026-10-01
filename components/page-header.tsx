export function PageHeader({
  title,
  subtitle,
  actions,
  dense = false,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <div className={dense ? "mb-2 flex flex-wrap items-start justify-between gap-2" : "mb-6 flex flex-wrap items-start justify-between gap-4"}>
      <div>
        <h1 className={dense ? "text-lg font-semibold tracking-tight text-slate-900" : "text-2xl font-semibold tracking-tight text-slate-900"}>
          {title}
        </h1>
        {subtitle ? (
          <p className={dense ? "mt-0.5 max-w-3xl text-[12.5px] text-slate-500" : "mt-1 max-w-2xl text-sm text-slate-500"}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
