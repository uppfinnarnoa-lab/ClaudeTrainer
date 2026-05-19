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
        {/*
          Activity icon (Lucide) rotated 90° CW, scaled to the T stem area.
          Creates a transparent cutout in the exact shape of the ECG waveform.
        */}
        <mask id="act-cut">
          <rect width="40" height="40" fill="white" />
          <polyline
            points="20,21 20,23 21.5,24.5 28,27 12,32 19.5,34 20,37"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </mask>
      </defs>
      {/* Bold T — no background rect, transparent, accent color */}
      <g mask="url(#act-cut)" fill="#6EE7B7">
        {/* Crossbar: bold, minimal rounding */}
        <rect x="3" y="8" width="34" height="9" rx="0.5" />
        {/* Stem: wider and bolder */}
        <rect x="14.5" y="17" width="11" height="21" rx="0.5" />
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
