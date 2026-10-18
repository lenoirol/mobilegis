import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {C} from './tokens';

/** The web app's icon set, path for path (24 px grid, 2 px square-cap strokes). */
export type IconName = 'map' | 'table' | 'chart' | 'flask' | 'info' | 'play' | 'pause' | 'locate' | 'extent' | 'globe' | 'share' | 'layers' | 'search' | 'download' | 'plus' | 'minus' | 'x' | 'check' | 'chevron' | 'up' | 'lock' | 'user' | 'compare' | 'eye' | 'grid' | 'alert' | 'sliders';

const SHAPES: Record<IconName, (c: string) => React.ReactNode> = {
  map: () => <><Path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z" /><Path d="M9 4v14M15 6.5v14" /></>,
  table: () => <><Rect x="3" y="4" width="18" height="16" /><Path d="M3 10h18M3 15h18M9 4v16" /></>,
  chart: () => <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  flask: () => <><Path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" /><Path d="M7.5 15h9" /></>,
  info: () => <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v6M12 7.5v.5" /></>,
  play: () => <Path d="M7 4v16l13-8Z" />,
  pause: () => <Path d="M7 4v16M17 4v16" />,
  locate: c => <><Circle cx="12" cy="12" r="7" /><Path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><Circle cx="12" cy="12" r="1.5" fill={c} /></>,
  extent: () => <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  globe: () => <><Circle cx="12" cy="12" r="9" /><Path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
  share: () => <Path d="M12 3v12M7 8l5-5 5 5M5 14v7h14v-7" />,
  layers: () => <><Path d="m12 3 9 5-9 5-9-5 9-5Z" /><Path d="m3 13 9 5 9-5" /></>,
  search: () => <><Circle cx="11" cy="11" r="7" /><Path d="m20 20-4-4" /></>,
  download: () => <Path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  plus: () => <Path d="M12 5v14M5 12h14" />,
  minus: () => <Path d="M5 12h14" />,
  x: () => <Path d="M5 5l14 14M19 5 5 19" />,
  check: () => <Path d="m4 12 5 5 11-11" />,
  chevron: () => <Path d="m6 9 6 6 6-6" />,
  up: () => <Path d="m6 15 6-6 6 6" />,
  lock: () => <><Rect x="5" y="11" width="14" height="10" /><Path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  user: () => <><Circle cx="12" cy="8" r="4" /><Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  compare: () => <Path d="M12 3v18M4 7h5M4 12h5M4 17h5M15 9h5M15 14h5" />,
  eye: () => <><Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><Circle cx="12" cy="12" r="3" /></>,
  grid: () => <Path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  alert: () => <><Path d="M12 3 2 20h20L12 3Z" /><Path d="M12 10v5M12 17.5v.5" /></>,
  sliders: () => <><Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><Circle cx="16" cy="6" r="2" /><Circle cx="10" cy="12" r="2" /><Circle cx="18" cy="18" r="2" /></>,
};

export function Icon({name, size = 20, color = C.ink}: {name: IconName; size?: number; color?: string}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter">{SHAPES[name](color)}</Svg>;
}
