import {useEffect, useState} from 'react';
import {onSession, session} from './api';
/** Re-render when the signed-in user changes. */
export function useSession() {
  const [, tick] = useState(0);
  useEffect(() => onSession(() => tick(n => n + 1)), []);
  return session;
}
