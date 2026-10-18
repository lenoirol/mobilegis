import {useEffect, useRef, useState} from 'react';
import {T} from '@/ds';
import {valid} from '@/lib/format';

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
/** Number that counts up/down to its value like the web `countTo` (700 ms, cubic ease-out). */
export function CountUp({value, format, ms = 600, ...text}: {value: number | null | undefined; format: (v: number) => string; ms?: number} & Omit<React.ComponentProps<typeof T>, 'children'>) {
  const [shown, setShown] = useState<number | null>(valid(value) ? value : null);
  const from = useRef<number>(valid(value) ? value : 0);
  useEffect(() => {
    if (!valid(value)) { setShown(null); return; }
    const start = Date.now(), a = from.current; let raf = 0;
    const step = () => { const t = Math.min(1, (Date.now() - start) / ms), v = a + (value - a) * ease(t); setShown(v); from.current = v; if (t < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <T {...text}>{shown === null ? '—' : format(shown)}</T>;
}
