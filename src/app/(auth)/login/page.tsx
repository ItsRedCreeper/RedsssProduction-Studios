import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { SiteLogo } from "@/components/layout/SiteLogo";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginFormSlotProps = {
  searchParams: Promise<{ next?: string }>;
};

async function LoginFormSlot({ searchParams }: LoginFormSlotProps) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : "/";

  return <AuthForm nextPath={nextPath} />;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <SiteLogo size={72} className="shadow-lg shadow-black/40" />
        <div>
          <p className="text-base font-semibold tracking-tight text-foreground">
            RedsssProduction Studios
          </p>
          <p className="mt-1 text-sm text-muted">
            Sign in to continue
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="h-80 w-full max-w-md animate-pulse rounded-xl border border-border bg-surface" />
        }
      >
        <LoginFormSlot searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
