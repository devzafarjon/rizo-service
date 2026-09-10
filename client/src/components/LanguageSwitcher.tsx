import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_LABEL, LOCALE_NAME } from "../i18n/messages";
import { useI18n } from "../i18n/LanguageContext";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative z-[1000]">
      <button
        type="button"
        className={`flex items-center space-x-2 rounded-lg px-3 py-2 transition-all hover:bg-gray-100 ${
          open ? "bg-gray-100" : "bg-transparent"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("common.language")}
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeIcon />
        <span className="text-sm font-medium text-gray-700">{LOCALE_LABEL[locale]}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 min-w-40 overflow-hidden rounded-lg bg-white py-1 shadow-[0_0_10px_rgba(0,0,0,0.1)]"
        >
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === locale}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                code === locale ? "bg-gray-100 font-bold text-[#9103E4]" : "font-medium text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => {
                setLocale(code);
                setOpen(false);
              }}
            >
              <span>{LOCALE_NAME[code]}</span>
              <span className="text-xs text-gray-500">{LOCALE_LABEL[code]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-purple-600"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}
