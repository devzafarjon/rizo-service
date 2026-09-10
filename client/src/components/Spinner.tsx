export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-8 w-8 animate-spin rounded-full border-2 border-line border-t-rizo ${className}`}
      aria-label="Loading"
    />
  );
}
