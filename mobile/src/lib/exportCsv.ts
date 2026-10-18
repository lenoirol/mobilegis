import {File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {csvCell} from './format';

/** Writes a CSV (with a BOM so Excel reads Vietnamese) into the cache and opens the share sheet. */
export async function shareCsv(name: string, columns: string[], rows: Record<string, any>[]) {
  const text = '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\r\n');
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Máy này không có hộp thoại chia sẻ.');
  await Sharing.shareAsync(file.uri, {mimeType: 'text/csv', dialogTitle: 'Xuất bảng số liệu (CSV)'});
}
