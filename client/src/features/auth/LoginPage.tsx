import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, isUnreachableApi } from "../../lib/api";
import type { Role } from "../../lib/api";
import { useAuth } from "./AuthContext";
import { useToast } from "../../components/Toast";
import { RizoLogo } from "../../components/RizoLogo";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useI18n } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/messages";

const DEMO_ACCOUNTS: Array<{ role: Role; email: string }> = [
  { role: "dispatcher", email: "dispatcher@rizo.local" },
  { role: "technician", email: "tech@rizo.local" },
];

const fieldClass =
  "h-12 w-full rounded-lg border border-gray-200 bg-white py-2 pr-4 pl-10 text-base font-medium text-black outline-none placeholder:text-gray-400 focus:border-[#B439FD] sm:h-11 sm:text-sm";

function roleMessageKey(role: Role): MessageKey {
  return role === "dispatcher" ? "roles.dispatcher" : "roles.technician";
}

export function LoginPage() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("dispatcher@rizo.local");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={user.role === "technician" ? "/my-jobs" : "/dashboard"} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const nextUser = await login(email, password);
      notify(t("auth.signedIn"));
      navigate(nextUser.role === "technician" ? "/my-jobs" : "/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t("auth.invalidCredentials"));
      } else if (isUnreachableApi(err)) {
        setError(t("auth.apiUnreachable"));
      } else {
        setError(t("auth.unableToSignIn"));
      }
    } finally {
      setSubmitting(false);
    }
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

        <form className="w-full text-left" onSubmit={onSubmit}>
          <h1 className="mb-2 text-center text-[28px] font-bold leading-tight tracking-tight text-black sm:text-[34px]">
            {t("auth.title")}
          </h1>

          <label className="mt-8 mb-4 block">
            <span className="mb-1.5 block text-sm font-bold text-black">{t("common.email")}</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                <MailIcon />
              </span>
              <input
                className={fieldClass}
                type="email"
                autoComplete="username"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-bold text-black">{t("common.password")}</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                <KeyIcon />
              </span>
              <input
                className={`${fieldClass} pr-11`}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("common.password")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-black"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                <EyeIcon />
              </button>
            </div>
          </label>

          {error ? (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex h-14 w-full items-center justify-center rounded-lg bg-[#B439FD] px-4 py-4 text-base font-bold tracking-wider text-white transition-colors hover:bg-[#CA73FD] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t("common.signingIn") : t("common.signIn")}
          </button>
        </form>

        <div className="mt-8 w-full text-center text-sm text-gray-600">
          <p className="font-bold text-black">{t("auth.demoAccounts")}</p>
          <p className="mt-1">
            {t("auth.demoPassword")} <span className="font-bold text-black">password123</span>
          </p>
          <ul className="mt-4 grid gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-center rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold break-all text-[#B439FD] transition-colors hover:bg-gray-200"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("password123");
                  }}
                >
                  {t(roleMessageKey(account.role))}: {account.email}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link to="/portal/login" className="font-bold text-[#B439FD] hover:text-[#9103E4]">
              {t("auth.customerPortal")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M336 352c97.2 0 176-78.8 176-176S433.2 0 336 0S160 78.8 160 176c0 18.7 2.9 36.8 8.3 53.7L7 391c-4.5 4.5-7 10.6-7 17v80c0 13.3 10.7 24 24 24h80c13.3 0 24-10.7 24-24V448h40c13.3 0 24-10.7 24-24V384h40c6.4 0 12.5-2.5 17-7l33.3-33.3c16.9 5.4 35 8.3 53.7 8.3zM376 96a40 40 0 1 1 0 80 40 40 0 1 1 0-80z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true">
      <path d="M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4C142.5 443.2 207.2 480 288 480s145.5 36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C433.5 68.8 368.8 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64c-7.1 0-13.9-1.2-20.3-3.3c-5.5-1.8-11.9 1.6-11.7 7.4c.3 6.9 1.3 13.8 3.2 20.7c13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-11.1-41.5-47.8-69.4-88.6-71.1c-5.8-.2-9.2 6.1-7.4 11.7c2.1 6.4 3.3 13.2 3.3 20.3z" />
    </svg>
  );
}
