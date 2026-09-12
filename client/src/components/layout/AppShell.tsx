import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext";
import type { Role } from "../../lib/api";
import { useI18n } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/messages";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { RizoLogo } from "../RizoLogo";
import { navForRole } from "./nav";
import { useJobSocket } from "../../lib/socket";

function roleKey(role: Role): MessageKey {
  return role === "dispatcher" ? "roles.dispatcher" : "roles.technician";
}

function desktopNavClass(isActive: boolean) {
  return `inline-flex shrink-0 items-center whitespace-nowrap text-sm font-bold transition-colors xl:text-base ${
    isActive ? "text-[#9103E4]" : "text-gray-600 hover:text-[#9103E4]"
  }`;
}

function mobileNavClass(isActive: boolean, technician: boolean) {
  return `block rounded-md px-3 py-2 text-base font-medium ${
    technician ? "min-h-12" : ""
  } ${isActive ? "bg-gray-100 text-[#9103E4]" : "text-gray-600 hover:bg-gray-100 hover:text-[#9103E4]"}`;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wideBoard = location.pathname === "/jobs" || location.pathname === "/my-jobs";
  useJobSocket();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!user) {
    return null;
  }

  const technician = user.role === "technician";
  const items = navForRole(user.role);

  function onLogout() {
    setOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="z-50 w-full shadow-[0_0_10px_rgba(0,0,0,0.1)] md:p-4">
        <nav className="mx-auto flex h-10 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <p className="truncate text-xs text-black md:text-sm">
            <span className="font-medium">{user.name}</span>
            <span className="hidden text-gray-500 sm:inline"> · {t(roleKey(user.role))}</span>
          </p>
          <LanguageSwitcher />
        </nav>
      </header>

      <nav className="sticky top-0 z-40 mt-3 w-full font-bold">
        <div className="mx-auto max-w-6xl bg-white px-3 py-1 shadow-[0_0_10px_rgba(0,0,0,0.1)] sm:px-6 md:rounded-2xl lg:px-8">
          <div className="flex h-16 items-center justify-between gap-2">
            <RizoLogo className="h-16 w-16 shrink-0 object-contain" />

            <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 overflow-x-auto lg:flex xl:gap-6">
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => desktopNavClass(isActive)}>
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>

            <div className="hidden shrink-0 items-center lg:flex">
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg bg-gray-100 px-4 py-2 font-bold text-[#B439FD] transition-colors hover:bg-gray-200"
              >
                {t("common.signOut")}
              </button>
            </div>

            <div className="z-20 lg:hidden">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((value) => !value)}
              >
                <span className="sr-only">{open ? t("common.closeMenu") : t("common.openMenu")}</span>
                {open ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </div>

          {open ? (
            <div id={menuId} className="bg-white lg:hidden">
              <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => mobileNavClass(isActive, technician)}
                  >
                    {t(item.labelKey)}
                  </NavLink>
                ))}
                <button
                  type="button"
                  onClick={onLogout}
                  className={`block w-full rounded-md bg-gray-100 px-3 py-2 text-left text-base font-medium text-[#B439FD] hover:bg-gray-200 ${
                    technician ? "min-h-12" : ""
                  }`}
                >
                  {t("common.signOut")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      <main
        className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:px-8 ${
          wideBoard ? "max-w-[1600px]" : "max-w-6xl"
        } ${technician ? "pb-[max(2rem,env(safe-area-inset-bottom))]" : "pb-[max(4rem,env(safe-area-inset-bottom))]"}`}
      >
        <Outlet />
      </main>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
