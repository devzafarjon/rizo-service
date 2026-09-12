import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearPortalToken, getPortalToken, portalApi, setPortalToken, type PortalSession } from "../../lib/portalApi";
import type { PortalCustomer } from "../../lib/types";

type PortalAuthValue = {
  customer: PortalCustomer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PortalCustomer>;
  signup: (body: Record<string, string>) => Promise<PortalCustomer>;
  logout: () => void;
};

const PortalAuthContext = createContext<PortalAuthValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getPortalToken();
    if (!token) {
      setLoading(false);
      return;
    }
    portalApi<{ customer: PortalCustomer }>("/auth/me")
      .then((data) => setCustomer(data.customer))
      .catch(() => {
        clearPortalToken();
        setCustomer(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<PortalAuthValue>(
    () => ({
      customer,
      loading,
      login: async (email, password) => {
        const data = await portalApi<PortalSession>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setPortalToken(data.token);
        setCustomer(data.customer);
        return data.customer;
      },
      signup: async (body) => {
        const data = await portalApi<PortalSession>("/auth/signup", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setPortalToken(data.token);
        setCustomer(data.customer);
        return data.customer;
      },
      logout: () => {
        clearPortalToken();
        setCustomer(null);
      },
    }),
    [customer, loading],
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
