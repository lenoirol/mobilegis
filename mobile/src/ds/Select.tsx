import {useState} from 'react';
import {Pressable, ScrollView, View} from 'react-native';
import {BW, C, RADIUS} from './tokens';
import {T} from './Text';
import {Icon} from './Icon';
import {Dialog} from './Dialog';

/** `.select`: looks like the web select (44px, 2px border, chevron) and opens a list dialog. */
export function Select<V extends string | number>({value, options, onChange, label}: {value: V; options: {value: V; label: string}[]; onChange: (v: V) => void; label: string}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? ''}`} style={{minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, backgroundColor: '#fff'}}>
        <T w={500} s={15}>{current?.label ?? ''}</T><Icon name="chevron" size={16} />
      </Pressable>
      <Dialog visible={open} onClose={() => setOpen(false)}>
        <T w={800} s={20}>{label}</T>
        <ScrollView style={{maxHeight: 360}}>
          <View style={{gap: 6}}>{options.map(o => (
            <Pressable key={String(o.value)} onPress={() => { onChange(o.value); setOpen(false); }} accessibilityRole="radio" accessibilityState={{selected: o.value === value}} style={{paddingVertical: 12, paddingHorizontal: 12, borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, backgroundColor: o.value === value ? C.signal : '#fff'}}>
              <T w={700} s={15}>{o.label}</T>
            </Pressable>
          ))}</View>
        </ScrollView>
      </Dialog>
    </>
  );
}
