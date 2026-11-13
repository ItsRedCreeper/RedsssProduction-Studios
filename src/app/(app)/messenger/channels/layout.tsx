import type { Metadata } from "next";
import { MessengerLayout } from "@/components/messenger/MessengerLayout";

export const instant = false;

export const metadata: Metadata = {
  title: "RedsssMessenger",
};

export default function MessengerChannelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MessengerLayout />
      {children}
    </>
  );
}
