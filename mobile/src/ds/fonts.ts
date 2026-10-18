import {BricolageGrotesque_200ExtraLight, BricolageGrotesque_300Light, BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold} from '@expo-google-fonts/bricolage-grotesque';
import {JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold, JetBrainsMono_800ExtraBold} from '@expo-google-fonts/jetbrains-mono';

/** Same two families as the web app: Bricolage Grotesque (text) and JetBrains Mono (numbers and micro-labels). */
export const FONT_FILES = {
  BricolageGrotesque_200ExtraLight, BricolageGrotesque_300Light, BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
  JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold, JetBrainsMono_800ExtraBold,
};
export type Weight = 200 | 300 | 400 | 500 | 600 | 700 | 800;
const SANS: Record<number, string> = {200: 'BricolageGrotesque_200ExtraLight', 300: 'BricolageGrotesque_300Light', 400: 'BricolageGrotesque_400Regular', 500: 'BricolageGrotesque_500Medium', 600: 'BricolageGrotesque_600SemiBold', 700: 'BricolageGrotesque_700Bold', 800: 'BricolageGrotesque_800ExtraBold'};
const MONO: Record<number, string> = {200: 'JetBrainsMono_400Regular', 300: 'JetBrainsMono_400Regular', 400: 'JetBrainsMono_400Regular', 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_600SemiBold', 700: 'JetBrainsMono_700Bold', 800: 'JetBrainsMono_800ExtraBold'};
export const family = (kind: 'sans' | 'mono', weight: Weight = 400) => (kind === 'sans' ? SANS : MONO)[weight];
