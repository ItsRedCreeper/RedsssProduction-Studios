export const instant = false;

export default async function MessengerChannelPage({
  params,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
}) {
  await params;
  return null;
}
