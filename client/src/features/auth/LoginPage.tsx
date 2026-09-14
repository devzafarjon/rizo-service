import { Navigate, useNavigate } from "react-router-dom";
import type { Role } from "../../lib/types";
import { useAuth } from "./AuthContext";
import { usePortalAuth } from "../customer-portal/PortalAuthContext";
import { useToast } from "../../components/Toast";
import { RizoLogo } from "../../components/RizoLogo";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useI18n } from "../../i18n/LanguageContext";

export function LoginPage() {
  const { user, enter } = useAuth();
  const { enter: enterPortal } = usePortalAuth();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to={user.role === "technician" ? "/my-jobs" : "/dashboard"} replace />;
  }

  function openStaff(role: Role) {
    const next = enter(role);
    notify(t("auth.signedIn"));
    navigate(next.role === "technician" ? "/my-jobs" : "/dashboard");
  }

  function openPortal() {
    enterPortal();
    notify(t("auth.signedIn"));
    navigate("/portal");
  }

  return (
    <div className="min-h-dvh bg-white">
      <header className="z-50 w-full pt-[env(safe-area-inset-top)] md:p-4 md:pt-[max(1rem,env(safe-area-inset-top))]">
        <nav className="mx-auto flex min-h-11 max-w-6xl items-center justify-end px-3 sm:px-6 lg:px-8">
          <LanguageSwitcher />
        </nav>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[420px] flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        <RizoLogo className="mb-2 h-24 w-24 object-contain" />
        <h1 className="mb-2 text-center text-[28px] font-bold leading-tight tracking-tight text-black sm:text-[34px]">
          {t("auth.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-gray-600">{t("auth.chooseAccount")}</p>

        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => openStaff("dispatcher")}
            className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-[#B439FD] px-4 text-base font-bold tracking-wider text-white transition-colors hover:bg-[#CA73FD]"
          >
            {t("roles.dispatcher")}
          </button>
          <button
            type="button"
            onClick={() => openStaff("technician")}
            className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-gray-100 px-4 text-base font-bold text-[#B439FD] transition-colors hover:bg-gray-200"
          >
            {t("roles.technician")}
          </button>
          <button
            type="button"
            onClick={openPortal}
            className="inline-flex h-14 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-base font-bold text-black transition-colors hover:border-[#B439FD] hover:text-[#9103E4]"
          >
            {t("portal.enterShop")}
          </button>
        </div>
      </div>
    </div>
  );
}
