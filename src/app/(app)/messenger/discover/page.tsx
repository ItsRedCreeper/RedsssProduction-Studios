import type { Metadata } from "next";
import { MessengerLayout } from "@/components/messenger/MessengerLayout";

export const metadata: Metadata = {
  title: "Discover · RedsssMessenger",
};

export default function MessengerDiscoverRoute() {
  return <MessengerLayout discover />;
}
