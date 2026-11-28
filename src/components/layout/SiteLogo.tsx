type SiteLogoProps = {
  className?: string;
  size?: number;
};

export function SiteLogo({ className = "", size = 36 }: SiteLogoProps) {
  // Prefer the compact asset for UI slots; full original kept as logo-original.jpg.
  const src = size <= 48 ? "/logo-128.jpg" : "/logo-256.jpg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="RedsssProduction Studios"
      width={size}
      height={size}
      decoding="async"
      fetchPriority="high"
      className={`shrink-0 rounded-md object-cover ring-1 ring-accent/50 ${className}`}
    />
  );
}
