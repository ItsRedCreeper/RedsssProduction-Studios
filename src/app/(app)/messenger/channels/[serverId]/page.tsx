export const instant = false;

export default async function MessengerServerPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  await params;
  return null;
}
