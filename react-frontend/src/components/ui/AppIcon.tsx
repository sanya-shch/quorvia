// One small stroke-icon set for the app shell (workspace, dashboard, builder). Every icon is
// decorative (aria-hidden): the text beside it, or the button's aria-label, carries the meaning.
const PATHS = {
  arrowLeft: "M19 12H5m6-6l-6 6 6 6",
  arrowRight: "M5 12h14m-6-6l6 6-6 6",
  check: "M4.5 12.75l6 6 9-13.5",
  checkCircle: "M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 12.5l2.5 2.5 4.5-5",
  chevronDown: "M19.5 8.25l-7.5 7.5-7.5-7.5",
  close: "M6 6l12 12M18 6L6 18",
  copy: "M8 8h10a2 2 0 012 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10a2 2 0 012-2zM4 16V6a2 2 0 012-2h10",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  edit: "M16.5 3.5l4 4L8 20H4v-4L16.5 3.5z",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.75a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5z",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  globe:
    "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.75 5.5 3.75 9S14.5 18.5 12 21c-2.5-2.5-3.75-5.5-3.75-9S9.5 5.5 12 3z",
  grid: "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z",
  inbox: "M4 13l2.5-7h11L20 13v5H4v-5zm0 0h4l1.5 2h5l1.5-2h4",
  layers: "M12 3l9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5",
  plus: "M12 5v14M5 12h14",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  search: "M21 21l-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z",
  share:
    "M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
  warning:
    "M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  external: "M14 4h6v6m0-6L10 14M20 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h5",
  refresh: "M20 11a8 8 0 00-14.9-3M4 5v4h4M4 13a8 8 0 0014.9 3M20 19v-4h-4",
  logic:
    "M6 3v12m0 0a3 3 0 103 3 3 3 0 00-3-3zm12-9a3 3 0 10-3 3 3 3 0 003-3zm0 0v2a4 4 0 01-4 4H9",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z",
  pin: "M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  drag: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  panel: "M4 5h16v14H4V5zm11 0v14",
  panelLeft: "M4 5h16v14H4V5zm5 0v14",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  bell: "M15 17H5l1.4-1.4A2 2 0 007 14.2V11a5 5 0 0110 0v3.2c0 .5.2 1 .6 1.4L19 17h-4zm0 0a3 3 0 11-6 0",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  monitor: "M4 5h16v11H4V5zm5 15h6M12 16v4",
  tablet: "M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm5 15h2",
  phone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zm3 15h2",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5z",
  bars: "M5 20V10M12 20V4M19 20v-7",
} as const;

export type AppIconName = keyof typeof PATHS;

export default function AppIcon({
  name,
  className = "h-4 w-4",
  strokeWidth = 2,
}: {
  name: AppIconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
