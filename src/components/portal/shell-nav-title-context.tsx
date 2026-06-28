"use client";

import * as React from "react";

interface ShellNavTitleContextValue {
  collapsedTitle: string | null;
  setCollapsedTitle: (title: string | null) => void;
  titleCollapsed: boolean;
  setTitleCollapsed: (collapsed: boolean) => void;
}

const ShellNavTitleContext = React.createContext<ShellNavTitleContextValue>({
  collapsedTitle: null,
  setCollapsedTitle: () => {},
  titleCollapsed: false,
  setTitleCollapsed: () => {},
});

export function ShellNavTitleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsedTitle, setCollapsedTitle] = React.useState<string | null>(
    null,
  );
  const [titleCollapsed, setTitleCollapsed] = React.useState(false);

  const value = React.useMemo(
    () => ({
      collapsedTitle,
      setCollapsedTitle,
      titleCollapsed,
      setTitleCollapsed,
    }),
    [collapsedTitle, titleCollapsed],
  );

  return (
    <ShellNavTitleContext.Provider value={value}>
      {children}
    </ShellNavTitleContext.Provider>
  );
}

export function useShellNavTitle() {
  return React.useContext(ShellNavTitleContext);
}

/** Register page title for collapsed mobile nav bar. */
export function useRegisterShellNavTitle(title: string) {
  const { setCollapsedTitle, setTitleCollapsed } = useShellNavTitle();

  React.useEffect(() => {
    setCollapsedTitle(title);
    return () => setCollapsedTitle(null);
  }, [title, setCollapsedTitle]);
}

/** @deprecated Use {@link ShellNavTitleProvider} */
export const PortalNavTitleProvider = ShellNavTitleProvider;
/** @deprecated Use {@link useShellNavTitle} */
export const usePortalNavTitle = useShellNavTitle;
/** @deprecated Use {@link useRegisterShellNavTitle} */
export const useRegisterPortalNavTitle = useRegisterShellNavTitle;
