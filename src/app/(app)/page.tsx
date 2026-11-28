import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

/** AppShell mounts chrome client-side; home is intentionally non-instant. */
export const instant = false;

export default function HomePage() {
  return (
    <PlaceholderPage
      title="Home"
      description="Home page – content coming soon"
    />
  );
}
