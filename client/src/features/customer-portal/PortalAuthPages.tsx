import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, isUnreachableApi } from "../../lib/api";
import { portalApi } from "../../lib/portalApi";
import { usePortalAuth } from "./PortalAuthContext";
import { useI18n } from "../../i18n/LanguageContext";
import { useToast } from "../../components/Toast";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { RizoLogo } from "../../components/RizoLogo";
import { Label, PrimaryButton, TextField } from "../../components/ui";

const fieldClass =
  "h-12 w-full rounded-lg border border-gray-200 bg-white px-4 text-base font-medium text-black outline-none placeholder:text-gray-400 focus:border-[#B439FD] sm:h-11 sm:text-sm";

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
  const { customer, login } = usePortalAuth();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("baraka@shop.uz");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (customer) {
    return <Navigate to="/portal" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      notify(t("auth.signedIn"));
      navigate("/portal");
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
    <PortalAuthFrame>
      <form className="w-full text-left" onSubmit={onSubmit}>
        <h1 className="mb-2 text-center text-[28px] font-bold leading-tight text-black sm:text-[34px]">{t("portal.loginTitle")}</h1>
        <p className="mb-8 text-center text-sm text-gray-600">{t("portal.loginSubtitle")}</p>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-bold text-black">{t("common.email")}</span>
          <input className={fieldClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-bold text-black">{t("common.password")}</span>
          <input className={fieldClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-14 w-full items-center justify-center rounded-lg bg-[#B439FD] px-4 text-base font-bold text-white hover:bg-[#CA73FD] disabled:opacity-60"
        >
          {submitting ? t("common.signingIn") : t("common.signIn")}
        </button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm">
        <p>
          <Link to="/portal/forgot" className="font-bold text-[#B439FD]">{t("portal.forgot")}</Link>
        </p>
        <p>
          <Link to="/portal/signup" className="font-bold text-[#B439FD]">{t("portal.needAccount")}</Link>
        </p>
        <p className="pt-2 text-gray-500">
          <Link to="/login" className="font-bold text-gray-600 hover:text-[#9103E4]">{t("portal.staffSignIn")}</Link>
        </p>
        <p className="pt-4 text-gray-500">
          {t("auth.demoPassword")} <span className="font-bold text-black">password123</span>
          <br />
          baraka@shop.uz
        </p>
      </div>
    </PortalAuthFrame>
  );
}

export function PortalSignupPage() {
  const { customer, signup } = usePortalAuth();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Toshkent");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (customer) {
    return <Navigate to="/portal" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup({ name, email, phone, address, city, password });
      notify(t("portal.signedUp"));
      navigate("/portal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalAuthFrame>
      <form className="w-full text-left" onSubmit={onSubmit}>
        <h1 className="mb-2 text-center text-[28px] font-bold text-black">{t("portal.signupTitle")}</h1>
        <p className="mb-6 text-center text-sm text-gray-600">{t("portal.signupSubtitle")}</p>
        <div className="grid gap-3">
          <div>
            <Label>{t("portal.shopName")}</Label>
            <TextField value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>{t("common.email")}</Label>
            <TextField type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>{t("common.phone")}</Label>
            <TextField value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.address")}</Label>
            <TextField value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.city")}</Label>
            <TextField value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.password")}</Label>
            <TextField type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
        </div>
        {error ? <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null}
        <PrimaryButton type="submit" className="mt-5 w-full" disabled={submitting}>
          {t("portal.createAccount")}
        </PrimaryButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link to="/portal/login" className="font-bold text-[#B439FD]">{t("portal.haveAccount")}</Link>
      </p>
    </PortalAuthFrame>
  );
}

export function PortalForgotPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await portalApi<{ ok: true; resetUrl?: string }>("/auth/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResetUrl(data.resetUrl ?? "");
      setSent(true);
    } catch {
      setSent(true);
    }
  }

  return (
    <PortalAuthFrame>
      <form className="w-full text-left" onSubmit={onSubmit}>
        <h1 className="mb-2 text-center text-[28px] font-bold text-black">{t("portal.forgotTitle")}</h1>
        <p className="mb-6 text-center text-sm text-gray-600">{t("portal.forgotSubtitle")}</p>
        {sent ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
            {t("portal.forgotSent")}
            {resetUrl ? (
              <span className="mt-3 block break-all font-medium text-[#B439FD]">
                <Link to={resetUrl.replace(/^https?:\/\/[^/]+/, "")}>{t("portal.openReset")}</Link>
              </span>
            ) : null}
          </p>
        ) : (
          <>
            <Label>{t("common.email")}</Label>
            <TextField type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PrimaryButton type="submit" className="mt-5 w-full">{t("portal.sendReset")}</PrimaryButton>
          </>
        )}
      </form>
      <p className="mt-6 text-center text-sm">
        <Link to="/portal/login" className="font-bold text-[#B439FD]">{t("common.back")}</Link>
      </p>
    </PortalAuthFrame>
  );
}

export function PortalResetPage() {
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await portalApi("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      notify(t("portal.resetDone"));
      navigate("/portal/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.failed"));
    }
  }

  return (
    <PortalAuthFrame>
      <form className="w-full text-left" onSubmit={onSubmit}>
        <h1 className="mb-6 text-center text-[28px] font-bold text-black">{t("portal.resetTitle")}</h1>
        <Label>{t("portal.newPassword")}</Label>
        <TextField type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error ? <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null}
        <PrimaryButton type="submit" className="mt-5 w-full">{t("portal.savePassword")}</PrimaryButton>
      </form>
    </PortalAuthFrame>
  );
}

export function PortalVerifyPage() {
  const { t } = useI18n();
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const [state, setState] = useState<"idle" | "ok" | "bad">(token ? "idle" : "bad");

  useEffect(() => {
    if (!token) {
      return;
    }
    portalApi("/auth/verify", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => setState("ok"))
      .catch(() => setState("bad"));
  }, [token]);

  return (
    <PortalAuthFrame>
      <h1 className="text-center text-[28px] font-bold text-black">
        {state === "ok" ? t("portal.verifyOk") : state === "bad" ? t("portal.verifyBad") : t("common.loading")}
      </h1>
      <p className="mt-6 text-center">
        <Link to="/portal/login" className="font-bold text-[#B439FD]">{t("common.signIn")}</Link>
      </p>
    </PortalAuthFrame>
  );
}
