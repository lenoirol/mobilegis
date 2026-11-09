import * as Device from 'expo-device';
/** Máy yếu: RAM dưới 3,5 GB hoặc máy đời cũ. Bật "chế độ nhẹ": không khối 3D, không hiệu ứng bay bản đồ, gỡ bản đồ ở tab không xem. */
export function isLowEnd() {
  const ram = Device.totalMemory ?? 4e9, year = Device.deviceYearClass ?? 2021;
  return ram < 3.5e9 || year < 2018;
}
export const deviceLabel = () => `${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim() + (Device.isDevice ? '' : ' (máy ảo)');
