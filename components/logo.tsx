interface Props {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="TrainingLab"
    >
      <defs>
        <mask id="pulse-cut">
          <rect width="40" height="40" fill="white" />
          <polyline
            points="16,26 18,22 20,31 22,22 24,26"
            stroke="black"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <rect width="40" height="40" rx="9" fill="#0F1117" />
      <g mask="url(#pulse-cut)" fill="#6EE7B7">
        <rect x="4" y="9" width="32" height="7" rx="1.5" />
        <rect x="16" y="16" width="8" height="21" rx="1.5" />
      </g>
    </svg>
  );
}

export function LogoWordmark({ size = 32, className }: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Logo size={size} />
      <span
        className="font-semibold tracking-tight text-primary"
        style={{ fontSize: size * 0.55 }}
      >
        Training<span className="text-accent">Lab</span>
      </span>
    </div>
  );
}
