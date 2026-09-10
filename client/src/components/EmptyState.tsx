export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col justify-between rounded-3xl bg-white p-8 shadow-[0_0_10px_rgba(0,0,0,0.1)] sm:p-10">
      <span className="absolute top-5 right-5 h-3.5 w-3.5 rounded-full bg-red-400" />
      <h2 className="pr-6 text-xl font-semibold text-black sm:text-2xl">{title}</h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base">{description}</p>
    </div>
  );
}
