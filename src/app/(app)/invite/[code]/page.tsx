import type { Metadata } from "next";
import { InviteLanding } from "@/components/messenger/InviteLanding";

export const instant = false;

export const metadata: Metadata = {
  title: "Server Invite",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <InviteLanding code={code} />;
}
