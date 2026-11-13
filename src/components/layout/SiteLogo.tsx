type SiteLogoProps = {
  className?: string;
  size?: number;
};

export function SiteLogo({ className = "", size = 36 }: SiteLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt="RedsssProduction Studios"
      width={size}
      height={size}
      className={`shrink-0 rounded-md object-cover ring-1 ring-accent/50 ${className}`}
    />
  );
}
