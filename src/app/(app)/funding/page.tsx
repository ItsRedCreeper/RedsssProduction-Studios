import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export const metadata: Metadata = {
  title: "Funding",
};

export const instant = false;

export default function FundingPage() {
  return (
    <PlaceholderPage
      title="Funding"
      description="Funding – coming soon"
    />
  );
}
