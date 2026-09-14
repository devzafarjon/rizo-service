import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import { AuthProvider } from "./features/auth/AuthContext";
import { PortalAuthProvider } from "./features/customer-portal/PortalAuthContext";
import { HomeRedirect, ProtectedRoute, RoleRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { CustomerDetailPage, CustomerFormPage, CustomersPage } from "./features/customers/CustomersPage";
import { JobDetailPage, JobFormPage, JobsPage } from "./features/jobs/JobsPage";
import { DispatchPage } from "./features/dispatch/DispatchPage";
import { InvoiceDetailPage, InvoicesPage } from "./features/invoices/InvoicesPage";
import { MyJobsPage, TechnicianJobPage } from "./features/technician/MyJobsPage";
import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/Toast";
import { PortalGuard } from "./features/customer-portal/PortalGuard";
import { PortalShell } from "./features/customer-portal/PortalShell";
import { PortalLoginPage } from "./features/customer-portal/PortalAuthPages";
import { PortalDashboardPage, PortalNewRequestPage, PortalRequestPage } from "./features/customer-portal/PortalPages";
import { FeedbackPage } from "./features/feedback/FeedbackPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Office({ children }: { children: ReactNode }) {
  return <RoleRoute roles={["dispatcher"]}>{children}</RoleRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <PortalAuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/portal/login" element={<PortalLoginPage />} />
                <Route path="/portal/signup" element={<Navigate to="/portal/login" replace />} />
                <Route path="/portal/forgot" element={<Navigate to="/portal/login" replace />} />
                <Route path="/portal/reset" element={<Navigate to="/portal/login" replace />} />
                <Route path="/portal/verify" element={<Navigate to="/portal/login" replace />} />
                <Route
                  path="/portal"
                  element={
                    <PortalGuard>
                      <PortalShell />
                    </PortalGuard>
                  }
                >
                  <Route index element={<PortalDashboardPage />} />
                  <Route path="new" element={<PortalNewRequestPage />} />
                  <Route path="requests/:id" element={<PortalRequestPage />} />
                </Route>
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Office><DashboardPage /></Office>} />
                  <Route path="/customers" element={<Office><CustomersPage /></Office>} />
                  <Route path="/customers/new" element={<Office><CustomerFormPage /></Office>} />
                  <Route path="/customers/:id" element={<Office><CustomerDetailPage /></Office>} />
                  <Route path="/customers/:id/edit" element={<Office><CustomerFormPage /></Office>} />
                  <Route path="/jobs" element={<Office><JobsPage /></Office>} />
                  <Route path="/jobs/new" element={<Office><JobFormPage /></Office>} />
                  <Route path="/jobs/:id" element={<Office><JobDetailPage /></Office>} />
                  <Route path="/jobs/:id/edit" element={<Office><JobFormPage /></Office>} />
                  <Route path="/dispatch" element={<Office><DispatchPage /></Office>} />
                  <Route path="/invoices" element={<Office><InvoicesPage /></Office>} />
                  <Route path="/invoices/:id" element={<Office><InvoiceDetailPage /></Office>} />
                  <Route path="/feedback" element={<Office><FeedbackPage /></Office>} />
                  <Route path="/my-jobs" element={<RoleRoute roles={["technician"]}><MyJobsPage /></RoleRoute>} />
                  <Route path="/my-jobs/:id" element={<RoleRoute roles={["technician"]}><TechnicianJobPage /></RoleRoute>} />
                </Route>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
          </PortalAuthProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
