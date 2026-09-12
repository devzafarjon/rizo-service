import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const fieldClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-black outline-none placeholder:text-gray-400 focus:border-[#B439FD] sm:text-sm";

export function primaryClass(extra = "") {
  return `inline-flex min-h-11 items-center justify-center rounded-lg bg-[#B439FD] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#CA73FD] disabled:cursor-not-allowed disabled:opacity-60 ${extra}`;
}

export function ghostClass(extra = "") {
  return `inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-[#B439FD] transition-colors hover:bg-gray-200 disabled:opacity-60 ${extra}`;
}

export function Card({ children, className = "", dot }: { children: ReactNode; className?: string; dot?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-white p-4 shadow-[0_0_10px_rgba(0,0,0,0.1)] sm:p-6 lg:p-8 ${className}`}>
      {dot ? <span className={`absolute top-5 right-5 h-3.5 w-3.5 rounded-full ${dot}`} /> : null}
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-[1.65rem] font-bold tracking-tight text-black sm:text-4xl xl:text-5xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm text-gray-600 sm:mt-3 sm:text-base">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
    </div>
  );
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={primaryClass(props.className)} />;
}

export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={ghostClass(props.className)} />;
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} h-28 py-2 ${props.className ?? ""}`} />;
}

export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-bold text-black">{children}</span>;
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[min(90dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-[0_0_10px_rgba(0,0,0,0.1)] sm:p-8">
        <h2 className="mb-6 text-xl font-semibold break-words text-black sm:text-2xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}
