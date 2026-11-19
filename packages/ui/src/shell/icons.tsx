import type { ReactElement, ReactNode } from "react";
import type { ScreenKey } from "../screens/sample/types";

/** Inline SVG icons from the design. Drawn inline (no icon font) so they can never render as empty boxes. */
export function Icon({ children, size = 18 }: { children: ReactNode; size?: number }): ReactElement {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const navIcons: Record<ScreenKey, ReactElement> = {
  "all-capacities": (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  overview: <Icon><path d="M3 12h4l3-7 4 14 3-7h4" /></Icon>,
  anomalies: <Icon><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></Icon>,
  throttling: <Icon><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></Icon>,
  workspaces: <Icon><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></Icon>,
  "model-health": <Icon><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></Icon>,
  rebalance: <Icon><path d="M4 8h13l-3-3M20 16H7l3 3" /></Icon>,
  "alerts-settings": <Icon><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>,
};

/** Product mark: load bars under a capacity limit line. */
export const LogoIcon = (): ReactElement => <Icon size={20}><path d="M3 6h18" strokeDasharray="2.5 3" /><path d="M6 20v-7M11 20V10M16 20v-5M21 20v-9" /></Icon>;
export const MoonIcon = (): ReactElement => <Icon><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Icon>;
export const SunIcon = (): ReactElement => <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></Icon>;
export const ArrowUpRightIcon = (): ReactElement => <Icon size={16}><path d="M7 17L17 7M9 7h8v8" /></Icon>;
export const DatabaseIcon = (): ReactElement => <Icon size={16}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></Icon>;
/** Small icons for KPI tiles on the Live screens. */
export const kpiIcons = {
  gauge: <Icon size={20}><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></Icon>,
  pulse: <Icon size={20}><path d="M3 12h4l3-7 4 14 3-7h4" /></Icon>,
  split: <Icon size={20}><path d="M4 6h10M4 12h16M4 18h7" /></Icon>,
  alert: <Icon size={20}><path d="M12 4l9 15H3l9-15z" /><path d="M12 10v4M12 17v.5" /></Icon>,
  grid: <Icon size={20}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>,
  clock: <Icon size={20}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>,
  model: <Icon size={20}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></Icon>,
  check: <Icon size={20}><path d="M5 12l4.5 4.5L19 7" /></Icon>,
} as const;
export type KpiIconName = keyof typeof kpiIcons;
export const RefreshIcon = (): ReactElement => <Icon><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Icon>;
export const SendIcon = (): ReactElement => <Icon><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" /></Icon>;
export const SparkIcon = (): ReactElement => (
  <Icon>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
    <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" />
  </Icon>
);
