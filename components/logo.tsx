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
          Activity-icon waveform running horizontally through the entire T stem.
          Midline y=27.5 (center of stem y=17–38).
          Extends from x=7 to x=33 — clearly exits both left edge (x=13)
          and right edge (x=27) of the stem, creating open channels on both sides.
          Waveform peak/valley centered at x=20 (horizontal center of stem).
        */}
        <mask id="act-cut">
          <rect width="40" height="40" fill="white" />
          <polyline
            points="7,27.5 15,27.5 16.5,27 18.5,22.5 18.8,22.5 21,27.5 22,32.5 23.5,27.5 33,27.5"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="butt"
            strokeLinejoin="miter"
            fill="none"
          />
        </mask>
      </defs>
      {/* Bold T — single compound path, no seam, transparent background */}
      <path
        d="M2,7 H38 V17 H27 V38 H13 V17 H2 Z"
        fill="#6EE7B7"
        mask="url(#act-cut)"
      />
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
