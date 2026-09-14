import { Navigate, useNavigate } from "react-router-dom";
import { usePortalAuth } from "./PortalAuthContext";
import { useI18n } from "../../i18n/LanguageContext";
import { useToast } from "../../components/Toast";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { RizoLogo } from "../../components/RizoLogo";

function PortalAuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="z-50 w-full pt-[env(safe-area-inset-top)] md:p-4 md:pt-[max(1rem,env(safe-area-inset-top))]">
        <nav className="mx-auto flex min-h-11 max-w-6xl items-center justify-end px-3 sm:px-6 lg:px-8">
          <LanguageSwitcher />
        </nav>
      </header>
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[420px] flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        <RizoLogo className="mb-2 h-24 w-24 object-contain" />
        {children}
      </div>
    </div>
  );
}

export function PortalLoginPage() {
  const { customer, enter } = usePortalAuth();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();

  if (customer) {
    return <Navigate to="/portal" replace />;
  }

  function openPortal() {
    enter();
    notify(t("auth.signedIn"));
    navigate("/portal");
  }

  return (
    <PortalAuthFrame>
      <h1 className="mb-2 text-center text-[28px] font-bold leading-tight text-black sm:text-[34px]">{t("portal.loginTitle")}</h1>
      <p className="mb-8 text-center text-sm text-gray-600">{t("auth.chooseAccount")}</p>
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={openPortal}
          className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-[#B439FD] px-4 text-base font-bold text-white transition-colors hover:bg-[#CA73FD]"
        >
          {t("portal.enterShop")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-gray-100 px-4 text-base font-bold text-[#B439FD] transition-colors hover:bg-gray-200"
        >
          {t("portal.staffSignIn")}
        </button>
      </div>
    </PortalAuthFrame>
  );
}
