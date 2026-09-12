import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { usePortalAuth } from "./PortalAuthContext";
import { Spinner } from "../../components/Spinner";

export function PortalGuard({ children }: { children: ReactNode }) {
  const { customer, loading } = usePortalAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (!customer) {
    return <Navigate to="/portal/login" replace state={{ from: location }} />;
  }

  return children;
}
