// Small decorative icons of the public form. All are aria-hidden: the text next to them carries
// the meaning.
interface IconProps {
  className?: string;
}

const base = {
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 2,
  stroke: "currentColor",
  "aria-hidden": true,
} as const;

export const CheckCircleIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

export const CheckIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} strokeWidth={2.5} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export const ArrowLeftIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6-6l-6 6 6 6" />
  </svg>
);

export const ArrowRightIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
  </svg>
);

export const EyeIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg {...base} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
    />
    <circle cx="12" cy="12" r="2.75" />
  </svg>
);

export const InfoIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0-8h.01" />
  </svg>
);

export const GlobeIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 12h18M12 3c2.5 2.5 3.75 5.5 3.75 9S14.5 18.5 12 21c-2.5-2.5-3.75-5.5-3.75-9S9.5 5.5 12 3z"
    />
  </svg>
);

export const ChevronDownIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

// The Quorvia mark: three stacked layers.
export const LayersIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg {...base} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9 4.5 9-4.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5L12 21l9-4.5" />
  </svg>
);
