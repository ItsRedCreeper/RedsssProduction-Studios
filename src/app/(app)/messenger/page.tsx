import type { Metadata } from "next";
import { MessengerEntry } from "@/app/(app)/messenger/MessengerEntry";

export const metadata: Metadata = {
  title: "RedsssMessenger",
};

export default function MessengerPage() {
  return <MessengerEntry />;
}
