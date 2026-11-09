import {memo} from 'react';
import {INDEX, INDICES} from '@/lib/format';
import {setState, useStore} from '@/lib/store';
import {Seg} from './kit';

/** Một lựa chọn chỉ số dùng chung cho mọi tab: mã + tên tiếng Việt. */
export const IndexSwitch = memo(function IndexSwitch({only, color}: {only?: ('lst' | 'ndvi' | 'tvdi')[]; color?: string}) {
  const k = useStore(s => s.index);
  const list = only ?? INDICES;
  return <Seg options={list.map(i => ({value: i, label: INDEX[i].code, sub: INDEX[i].label}))} value={list.includes(k) ? k : list[0]} onChange={v => setState({index: v})} color={color} />;
});
