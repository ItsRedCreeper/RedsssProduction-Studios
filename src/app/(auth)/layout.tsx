export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="relative z-10 flex min-h-full flex-1 flex-col">
      {children}
    </main>
  );
}
