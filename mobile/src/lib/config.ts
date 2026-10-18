/** Backend of the deployed MobileGIS (Render + Supabase). Static research files are read from the same host. */
/** `EXPO_PUBLIC_API_BASE` lets a developer point a debug build at a local server (e.g. http://10.0.2.2:5379 from the Android emulator). */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://mobilegis-93u9.onrender.com';
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const CANONICAL_SOURCE = 'gee_recovery';
/** Start view: all 167 communes of TP.HCM (Côn Đảo excluded). */
export const START_CENTER: [number, number] = [106.82, 10.85];
export const START_ZOOM = 8.4;
