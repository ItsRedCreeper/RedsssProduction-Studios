import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export const metadata: Metadata = {
  title: "Games",
};

export default function GamesPage() {
  return (
    <PlaceholderPage
      title="Games"
      description="Games page – coming soon"
    />
  );
}
