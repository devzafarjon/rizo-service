type RizoLogoProps = {
  className?: string;
};

export function RizoLogo({ className = "h-24 w-24 object-contain" }: RizoLogoProps) {
  return (
    <img
      src="/rizo-logo.png"
      alt="RIZO"
      width={96}
      height={96}
      className={className}
    />
  );
}
