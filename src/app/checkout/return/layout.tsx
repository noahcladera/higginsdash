import { Suspense } from "react";

export default function CheckoutReturnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center p-6 text-sm text-[var(--muted-foreground)]">
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
