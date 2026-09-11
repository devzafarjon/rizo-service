export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B439FD] ${className}`}
      aria-label="Loading"
    />
  );
}
