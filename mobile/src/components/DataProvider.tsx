import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {loadDataset, indexRows, type Dataset, type RowIndex} from '@/lib/data';
import {loadSession} from '@/lib/api';

interface DataState {status: 'loading' | 'ready' | 'error'; error?: string; data?: Dataset; rows?: RowIndex; step: number; text: string; reload: () => void}
const Ctx = createContext<DataState>({status: 'loading', step: 0, text: '', reload: () => {}});
export const useData = () => useContext(Ctx);

export function DataProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<Omit<DataState, 'reload'>>({status: 'loading', step: 0, text: 'Đang kiểm tra máy chủ…'});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({status: 'loading', step: 0, text: 'Đang kiểm tra máy chủ…'});
    loadSession();
    loadDataset((step, text) => alive && setState(s => ({...s, step, text})))
      .then(data => alive && setState({status: 'ready', data, rows: indexRows(data.rows), step: 4, text: 'Sẵn sàng'}))
      .catch(error => alive && setState(s => ({...s, status: 'error', error: String(error?.message ?? error), text: 'Một phần dữ liệu chưa sẵn sàng'})));
    return () => { alive = false; };
  }, [attempt]);
  const value = useMemo(() => ({...state, reload: () => setAttempt(a => a + 1)}), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
