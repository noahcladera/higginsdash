"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_TERMS, type Terms } from "@/lib/tenant/terms";

/**
 * Pass-through context so client components can read the active tenant's
 * terminology without every parent threading a `terms` prop. The provider
 * is wired into each app shell once (admin / portal / coach), with the
 * value resolved server-side via `getTerms()`.
 */
const TermsContext = createContext<Terms>(DEFAULT_TERMS);

export function TermsProvider({
  value,
  children,
}: {
  value: Terms;
  children: ReactNode;
}): React.JSX.Element {
  return <TermsContext.Provider value={value}>{children}</TermsContext.Provider>;
}

/**
 * Read the active terminology from the nearest `<TermsProvider>`. Falls
 * back to `DEFAULT_TERMS` outside any provider so a stray client component
 * doesn't crash; the hardcoded fallback also matches the legacy copy that
 * was in place before tenants existed.
 */
export function useTerms(): Terms {
  return useContext(TermsContext);
}
