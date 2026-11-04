import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Tablet breakpoint. Portrait iPad mini is ~744pt wide, larger iPads 810–834pt;
 * phones top out around 430pt. 700 cleanly separates the two form factors.
 */
export const TABLET_BREAKPOINT = 700;

/**
 * Landscape tablet (every iPad in landscape is >= 1133pt, Android tablets ~1280dp).
 * At this width the side navigation shows labels and the home becomes a 3-column dashboard.
 */
export const WIDE_BREAKPOINT = 1000;

/** Width the tablet side navigation takes from the window (0 when none is shown). Set by TabletShell. */
export const SidebarWidthContext = createContext(0);

export type Responsive = {
  /** Current window width in points. */
  width: number;
  /** Width left for screen content after the tablet side navigation. */
  contentWidth: number;
  /** True on iPad-class widths (>= TABLET_BREAKPOINT). */
  isTablet: boolean;
  /** True on landscape-tablet widths (>= WIDE_BREAKPOINT). */
  isWide: boolean;
  /** Suggested column count for adaptive grids/sections (1 on phone, 2 on tablet). */
  columns: number;
  /** Horizontal screen gutter — wider on tablet so content breathes. */
  gutter: number;
};

/**
 * Split a list into `n` near-equal sequential chunks (column-major order:
 * chunk 0 holds the first slice, chunk 1 the next, …). Reading top-to-bottom
 * down one column then continuing in the next preserves natural list order.
 * Returns a single chunk when n <= 1, so callers can render the same markup
 * on phone (1 column) and tablet (N columns).
 */
export function splitColumns<T>(items: T[], n: number): T[][] {
  if (n <= 1 || items.length === 0) return [items];
  const perColumn = Math.ceil(items.length / n);
  const chunks: T[][] = [];
  for (let i = 0; i < n; i += 1) {
    const slice = items.slice(i * perColumn, (i + 1) * perColumn);
    if (slice.length > 0) chunks.push(slice);
  }
  return chunks;
}

export function useResponsive(): Responsive {
  const { width } = useWindowDimensions();
  const sidebar = useContext(SidebarWidthContext);
  const isTablet = width >= TABLET_BREAKPOINT;
  return {
    width,
    contentWidth: width - sidebar,
    isTablet,
    isWide: width >= WIDE_BREAKPOINT,
    columns: isTablet ? 2 : 1,
    gutter: isTablet ? 28 : 16,
  };
}
