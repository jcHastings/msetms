export type DriverDestination = {
  href: string;
  label: string;
  disabled?: boolean;
  featured?: boolean;
};

export function DriverDestinations({ items }: { items: DriverDestination[] }) {
  return (
    <nav className="mb-5 grid grid-cols-2 gap-3" data-driver-destinations="">
      {items.map((item) => {
        const featuredClass = item.featured ? " driver-dest-featured" : "";
        return item.disabled || !item.href ? (
          <span key={item.label} className={`driver-dest-off${featuredClass}`}>
            {item.label}
          </span>
        ) : (
          <a
            key={item.label}
            href={item.href}
            className={`driver-dest${featuredClass}`}
            data-driver-dest-href={item.href}
          >
            <span className="driver-dest-label">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
