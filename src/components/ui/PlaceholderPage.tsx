type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-6 h-px w-16 bg-gradient-to-r from-transparent via-accent to-transparent" />
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
        {description}
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          Content coming soon
        </p>
      </div>
    </div>
  );
}
