import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, messages, type Locale, type MessageKey } from "./messages";

const STORAGE_KEY = "fsm_lang";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value !== null && LOCALES.includes(value as Locale);
}

function detectLocale(): Locale {
  if (typeof window === "undefined") {
    return "uz";
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) {
    return stored;
  }

  const language = navigator.language.toLowerCase();
  if (language.startsWith("uz")) {
    return "uz";
  }
  if (language.startsWith("ru")) {
    return "ru";
  }
  if (language.startsWith("en")) {
    return "en";
  }
  return "uz";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (next) => setLocaleState(next),
      t: (key, vars) => {
        let text: string = messages[locale][key] ?? messages.en[key] ?? key;
        if (vars) {
          for (const [name, value] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, value);
          }
        }
        return text;
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return context;
}
