import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { clearToken } from "../../lib/api";
import { DEMO_STAFF, readStoredUser, writeStoredUser } from "../../lib/demoAuth";
import type { Role, User } from "../../lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  enter: (role: Role) => User;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: false,
      enter: (role) => {
        const next = DEMO_STAFF[role];
        clearToken();
        writeStoredUser(next);
        setUser(next);
        return next;
      },
      logout: () => {
        clearToken();
        writeStoredUser(null);
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
