import {Alert, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Directory, File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {csvCell} from './format';

/** Lưu CSV (có BOM để Excel đọc đúng tiếng Việt).
 *  Android: hộp thoại hệ thống hỏi người dùng chọn thư mục lưu (Storage Access Framework), đúng yêu cầu "hỏi lưu ở đâu".
 *  iPhone: hộp chia sẻ của iOS, chọn "Lưu vào Tệp" để chọn nơi lưu. Trả về mô tả nơi đã lưu, hoặc null nếu người dùng hủy. */
export async function saveCsv(name: string, columns: string[], rows: Record<string, unknown>[]): Promise<string | null> {
  const text = '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\r\n');
  if (Platform.OS === 'android') {
    // Android không cho chọn thẳng thư mục Download (hạn chế của hệ điều hành): hướng dẫn trước khi mở hộp chọn thư mục.
    const go = await new Promise<boolean>(res => Alert.alert('Chọn nơi lưu tệp CSV', 'Hộp thoại sau đây cho bạn chọn thư mục lưu. Android không cho chọn thư mục "Download" trực tiếp: hãy chọn "Documents" hoặc bấm "Tạo thư mục mới", rồi "Dùng thư mục này".',
      [{text: 'Hủy', style: 'cancel', onPress: () => res(false)}, {text: 'Chọn thư mục', onPress: () => res(true)}], {cancelable: true, onDismiss: () => res(false)}));
    if (!go) return null;
    const last = await AsyncStorage.getItem('mg:csvdir').catch(() => null);
    let dir: Directory;
    try { dir = await Directory.pickDirectoryAsync(last ?? undefined); } catch { return null; }   // người dùng bấm hủy
    AsyncStorage.setItem('mg:csvdir', dir.uri).catch(() => {});
    const file = dir.createFile(name.replace(/\.csv$/i, ''), 'text/csv');
    file.write(text);
    return decodeURIComponent(dir.uri).split(/[:/]/).filter(Boolean).slice(-1)[0] || 'thư mục đã chọn';
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create(); file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Máy này không có hộp thoại lưu tệp.');
  await Sharing.shareAsync(file.uri, {mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Lưu tệp CSV'});
  return 'nơi bạn đã chọn';
}
