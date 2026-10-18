import Svg, {Circle, G, Path, Rect} from 'react-native-svg';
import {CITY_PATH} from './logoPaths';

/** Brand mark (header). `parts` lets the splash animate the groups on its own. */
export function Logo({size = 30}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Rect x={10} y={10} width={104} height={104} rx={26} fill="#0e0e0c" />
      <Rect x={4} y={4} width={104} height={104} rx={26} fill="#3b5bff" stroke="#0e0e0c" strokeWidth={4} />
      <Path fill="#ffd60a" stroke="#0e0e0c" strokeWidth={4} strokeLinejoin="round" d={CITY_PATH} />
      <Circle cx={33} cy={40} r={3.5} fill="#0e0e0c" /><Circle cx={43} cy={39} r={3.5} fill="#0e0e0c" />
      <Path d="M34 46Q38.5 50 43 45.5" fill="none" stroke="#0e0e0c" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export const LogoTile = () => (
  <G><Rect x={10} y={10} width={104} height={104} rx={26} fill="#ffd60a" /><Rect x={4} y={4} width={104} height={104} rx={26} fill="#3b5bff" stroke="#0e0e0c" strokeWidth={4} /></G>
);
export const LogoSparkles = () => (
  <G>
    <Path d="M98 30l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#ffffff" stroke="#0e0e0c" strokeWidth={2} strokeLinejoin="round" />
    <Path d="M20 84l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#ffffff" stroke="#0e0e0c" strokeWidth={2} strokeLinejoin="round" />
  </G>
);
export const LogoCity = () => (
  <G translate="3, 3">
    <Path fill="#0e0e0c" d={CITY_PATH} />
    <Path fill="#ffd60a" stroke="#0e0e0c" strokeWidth={3.5} strokeLinejoin="round" d={CITY_PATH} />
  </G>
);
export const LogoFace = () => (
  <G>
    <Circle cx={33} cy={40} r={3} fill="#0e0e0c" /><Circle cx={43} cy={39} r={3} fill="#0e0e0c" />
    <Circle cx={34} cy={39} r={1} fill="#ffffff" /><Circle cx={44} cy={38} r={1} fill="#ffffff" />
    <Circle cx={29} cy={45} r={2.2} fill="#ff8fab" /><Circle cx={47.5} cy={44} r={2.2} fill="#ff8fab" />
    <Path d="M34 46Q38.5 50 43 45.5" fill="none" stroke="#0e0e0c" strokeWidth={2.5} strokeLinecap="round" />
    <Path d="M62 17C65 22 66 24 64 26.5A3 3 0 0 1 59.5 25C59.5 22.5 60.5 20 62 17Z" fill="#ffffff" stroke="#0e0e0c" strokeWidth={2} />
  </G>
);
