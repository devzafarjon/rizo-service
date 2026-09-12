import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePortalAuth } from "./PortalAuthContext";
import { useI18n } from "../../i18n/LanguageContext";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { RizoLogo } from "../../components/RizoLogo";

const LINKS = [
  { to: "/portal", labelKey: "portal.nav.requests" as const, end: true },
  { to: "/portal/new", labelKey: "portal.nav.new" as const, end: false },
];

function navClass(isActive: boolean) {
  return `inline-flex min-h-11 items-center whitespace-nowrap text-sm font-bold transition-colors ${
    isActive ? "text-[#9103E4]" : "text-gray-600 hover:text-[#9103E4]"
  }`;
}

export function PortalShell() {
  const { customer, logout } = usePortalAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!customer) {
    return null;
  }

  function onLogout() {
    logout();
    navigate("/portal/login");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="z-50 w-full shadow-[0_0_10px_rgba(0,0,0,0.1)] md:p-4">
        <nav className="mx-auto flex h-10 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <p className="truncate text-xs text-black md:text-sm">
            <span className="font-medium">{customer.name}</span>
            <span className="hidden text-gray-500 sm:inline"> · {t("portal.shopAccount")}</span>
          </p>
          <LanguageSwitcher />
        </nav>
      </header>

      <nav className="sticky top-0 z-40 mt-3 w-full font-bold">
        <div className="mx-auto max-w-6xl bg-white px-3 py-1 shadow-[0_0_10px_rgba(0,0,0,0.1)] sm:px-6 md:rounded-2xl lg:px-8">
          <div className="flex h-16 items-center justify-between gap-2">
            <RizoLogo className="h-16 w-16 shrink-0 object-contain" />
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-6 sm:flex">
              {LINKS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => navClass(isActive)}>
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="hidden rounded-lg bg-gray-100 px-4 py-2 font-bold text-[#B439FD] hover:bg-gray-200 sm:inline-flex"
            >
              {t("common.signOut")}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 sm:hidden"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="sr-only">{open ? t("common.closeMenu") : t("common.openMenu")}</span>
              <span className="text-xl font-bold">{open ? "×" : "☰"}</span>
            </button>
          </div>
          {open ? (
            <div id={menuId} className="space-y-1 px-2 pt-2 pb-3 sm:hidden">
              {LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block min-h-12 rounded-md px-3 py-2 text-base font-medium ${
                      isActive ? "bg-gray-100 text-[#9103E4]" : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={onLogout}
                className="block min-h-12 w-full rounded-md bg-gray-100 px-3 py-2 text-left text-base font-medium text-[#B439FD]"
              >
                {t("common.signOut")}
              </button>
            </div>
          ) : null}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
