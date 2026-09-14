import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEMO_PORTAL, readStoredPortal, writeStoredPortal } from "../../lib/demoAuth";
import { clearPortalToken } from "../../lib/portalApi";
import type { PortalCustomer } from "../../lib/types";

type PortalAuthValue = {
  customer: PortalCustomer | null;
  loading: boolean;
  enter: () => PortalCustomer;
  logout: () => void;
};

const PortalAuthContext = createContext<PortalAuthValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<PortalCustomer | null>(() => readStoredPortal());

  const value = useMemo<PortalAuthValue>(
    () => ({
      customer,
      loading: false,
      enter: () => {
        clearPortalToken();
        writeStoredPortal(DEMO_PORTAL);
        setCustomer(DEMO_PORTAL);
        return DEMO_PORTAL;
      },
      logout: () => {
        clearPortalToken();
        writeStoredPortal(null);
        setCustomer(null);
      },
    }),
    [customer],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);
  if (!context) {
    throw new Error("usePortalAuth must be used within PortalAuthProvider");
  }
  return context;
}
