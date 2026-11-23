/* Tính lợi ích trồng cây xanh — hàm tính THUẦN, dùng chung cho web và app Android.
   Bản gốc: public/js/core/treecalc.js. scripts/build_mobile_bundle.py chép nguyên văn sang mobile/src/lib/treecalc.js
   (tests/treecalc.test.mjs kiểm tra hai bản giống hệt nhau và tái lập đúng ví dụ của đề bài).

   Công thức (theo đề bài của giảng viên):
     CO₂ = N×C×T/1000 (tấn)            O₂ = CO₂×32/44 ≈ CO₂×0,727 (tấn, tỉ lệ khối lượng phân tử O₂/CO₂)
     B_tổng = N×B×T (kg)               S_tổng = N×S×f (m²)                V = N×R×T/1000 (m³)
     G₁ = CO₂×P₁   G₂ = B_tổng×P₂   G₃ = V×P₃
     G_tổng = (các G được chọn) − C_đầu tư − C_bảo dưỡng,  C_đầu tư = N×c_đt,  C_bảo dưỡng = N×c_bd×T
   Không suy ra mức giảm nhiệt độ: bản đồ đo nhiệt độ BỀ MẶT từ vệ tinh, không đủ cơ sở để quy đổi số cây thành độ C. */

export const O2_PER_CO2 = 32 / 44;

/** Các hệ số nhập. def = giá trị VÍ DỤ của đề bài (không phải số đo tại TP.HCM); hint = khoảng tham khảo có nguồn. */
export const PARAMS = [
  {key: 'N', sym: 'N', label: 'Số cây trồng', unit: 'cây', def: 1000, min: 1, max: 10000000, step: 1, group: 'plan'},
  {key: 'T', sym: 'T', label: 'Số năm tính', unit: 'năm', def: 10, min: 1, max: 100, step: 1, group: 'plan'},
  {key: 'C', sym: 'C', label: 'CO₂ hấp thụ mỗi cây', unit: 'kg CO₂/cây/năm', def: 20, min: 0, max: 1000, step: 0.1, group: 'tree',
    hint: 'Tham khảo: khoảng 16 kg (cây nhỏ, đường kính thân 8–15 cm) đến 340 kg (cây rất lớn, trên 76 cm) mỗi năm — McPherson (1998), cây đô thị Chicago. Ở TP.HCM chưa có số đo theo từng cây; nghiên cứu i-Tree ở công viên Tao Đàn và 23/9 chỉ cho số tổng theo diện tích. Cây đường phố phổ biến ở TP Thủ Đức: dầu rái, sao đen, lim xẹt, bằng lăng.', src: 'mcpherson'},
  {key: 'B', sym: 'B', label: 'Sinh khối tăng thêm mỗi cây', unit: 'kg/cây/năm', def: 12, min: 0, max: 1000, step: 0.1, group: 'tree',
    hint: 'Phụ thuộc loài và tuổi cây; nên lấy theo số liệu lâm học của loài trồng.'},
  {key: 'S', sym: 'S', label: 'Diện tích tán mỗi cây', unit: 'm²/cây', def: 15, min: 0, max: 2000, step: 0.1, group: 'tree',
    hint: 'Diện tích hình chiếu tán khi cây trưởng thành; đo hoặc lấy theo loài.'},
  {key: 'f', sym: 'f', label: 'Hệ số che phủ thực tế', unit: '0 – 1', def: 1, min: 0, max: 1, step: 0.05, group: 'tree',
    hint: '1 = tán không chồng lên nhau; nhỏ hơn 1 khi tán chồng lấn hoặc cây chưa lớn hết.'},
  {key: 'R', sym: 'R', label: 'Nước mưa giữ lại mỗi cây', unit: 'lít/cây/năm', def: 300, min: 0, max: 100000, step: 1, group: 'tree',
    hint: 'Tham khảo: khoảng 220 lít (hệ số quy đổi 59 gallon/cây/năm dùng khi thẩm định ở Wisconsin) đến khoảng 6.700–7.600 lít (mô hình cho cây 15–20 năm tuổi ở Cincinnati).', src: 'rain'},
  {key: 'P1', sym: 'P₁', label: 'Giá tín chỉ carbon', unit: 'đồng/tấn CO₂', def: 300000, min: 0, max: 100000000, step: 1000, group: 'price',
    hint: 'Giá ví dụ của đề bài; giá thực tế phụ thuộc thị trường và loại tín chỉ.'},
  {key: 'P2', sym: 'P₂', label: 'Giá trị sinh khối', unit: 'đồng/kg', def: 1000, min: 0, max: 10000000, step: 100, group: 'price',
    hint: 'Giá ví dụ của đề bài.'},
  {key: 'P3', sym: 'P₃', label: 'Giá trị nước giữ lại', unit: 'đồng/m³', def: 10000, min: 0, max: 10000000, step: 100, group: 'price',
    hint: 'Giá ví dụ của đề bài. Để so sánh: nước sinh hoạt hộ gia đình TP.HCM trong định mức là 6.700 đồng/m³ (chưa VAT, từ 01/01/2022).', src: 'water'},
  {key: 'cdt', sym: 'c_đt', label: 'Chi phí trồng mỗi cây', unit: 'đồng/cây', def: 0, min: 0, max: 1000000000, step: 1000, group: 'cost',
    hint: 'Cây giống, đào hố, công trồng… Để 0 nếu chưa có số liệu.'},
  {key: 'cbd', sym: 'c_bd', label: 'Chi phí chăm sóc mỗi cây mỗi năm', unit: 'đồng/cây/năm', def: 0, min: 0, max: 1000000000, step: 1000, group: 'cost',
    hint: 'Tưới, cắt tỉa, thay cây chết… Để 0 nếu chưa có số liệu.'},
];
export const GROUPS = [
  {key: 'plan', title: 'Kế hoạch trồng'},
  {key: 'tree', title: 'Hệ số của cây'},
  {key: 'price', title: 'Đơn giá quy đổi'},
  {key: 'cost', title: 'Chi phí (không bắt buộc)'},
];
export const SOURCES = {
  mcpherson: {text: 'McPherson, E. G. (1998), USDA Forest Service – Pacific Southwest Research Station: lượng CO₂ cây đô thị Chicago hấp thụ theo cỡ đường kính thân.', url: 'https://www.fs.usda.gov/psw/publications/mcpherson/psw_1998_mcpherson003.pdf'},
  rain: {text: 'Chesapeake Bay Program, tổng hợp tài liệu về tán cây đô thị (mô hình Cincinnati của Berland và Hopton, 2014) và bài trình bày của Selbig tại hội thảo nước mưa quận Waukesha 2021 (hệ số 59 gallon/cây/năm).', url: 'https://www.chesapeakebay.net/files/documents/utc_literature_synthesis_update_aug31_draft_attachment_b.pdf'},
  hcmPark: {text: 'Nghiên cứu sơ bộ lợi ích của công viên đô thị TP.HCM (Tao Đàn, 23/9) bằng công cụ i-Tree (ResearchGate, 2025).', url: 'https://www.researchgate.net/publication/390363386_A_preliminary_study_on_the_benefits_of_urban_parks_in_Ho_Chi_Minh_City_using_i-Tree_tools'},
  thuDuc: {text: 'Kiểm kê cây đường phố TP Thủ Đức: 31.023 cây, 65 loài (Tạp chí Nông nghiệp và Phát triển, ĐH Nông Lâm TP.HCM).', url: 'https://jad.hcmuaf.edu.vn/index.php/jad/article/view/1016'},
  water: {text: 'Báo Sài Gòn Giải Phóng: đơn giá nước sinh hoạt hộ gia đình TP.HCM tính theo định mức.', url: 'https://www.sggp.org.vn/don-gia-nuoc-sinh-hoat-ho-gia-dinh-tinh-theo-dinh-muc-post787873.html'},
};
/** Giá trị nào được cộng vào tổng. Mặc định theo đúng công thức đề bài (cả ba). */
export const BENEFITS = [
  {key: 'G1', label: 'Carbon (G₁)'},
  {key: 'G2', label: 'Sinh khối (G₂)'},
  {key: 'G3', label: 'Nước mưa (G₃)'},
];
export const SCENARIOS = [
  {key: 'all', label: 'Tổng hợp', use: {G1: true, G2: true, G3: true}, note: 'Đúng công thức của đề bài: G₁ + G₂ + G₃. Lưu ý G₁ (carbon) và G₂ (sinh khối) cùng đến từ phần gỗ cây tích lũy nên có thể bị tính trùng một phần.'},
  {key: 'nodup', label: 'Không tính trùng', use: {G1: true, G2: false, G3: true}, note: 'Chỉ G₁ + G₃: bỏ G₂ để tránh tính hai lần cùng một lượng gỗ (vừa bán tín chỉ carbon, vừa tính giá trị sinh khối).'},
  {key: 'carbon', label: 'Chỉ carbon', use: {G1: true, G2: false, G3: false}, note: 'Chỉ giá trị tín chỉ carbon G₁.'},
  {key: 'water', label: 'Chỉ nước mưa', use: {G1: false, G2: false, G3: true}, note: 'Chỉ giá trị nước mưa được tán cây giữ lại G₃.'},
];

export const defaults = () => Object.fromEntries(PARAMS.map(p => [p.key, p.def]));

/** Đưa một bộ hệ số về số hợp lệ (thiếu → mặc định, ngoài khoảng → cắt về biên). Trả về {values, problems[]}. */
export function sanitize(input = {}) {
  /** @type {Record<string, number>} */ const values = {};
  /** @type {string[]} */ const problems = [];
  for (const p of PARAMS) {
    let v = input[p.key];
    if (typeof v === 'string') v = Number(v.replace(/\./g, '').replace(',', '.'));
    if (typeof v !== 'number' || !Number.isFinite(v)) { values[p.key] = p.def; if (input[p.key] !== undefined && input[p.key] !== '') problems.push(`${p.label}: không phải số, dùng ${p.def}`); continue; }
    if (v < p.min || v > p.max) { problems.push(`${p.label}: phải trong khoảng ${p.min} – ${p.max}`); v = Math.min(p.max, Math.max(p.min, v)); }
    if (p.key === 'N' || p.key === 'T') v = Math.round(v);
    values[p.key] = v;
  }
  return {values, problems};
}

/** Tính toàn bộ kết quả. use: {G1,G2,G3} — giá trị nào cộng vào tổng. */
export function compute(input, use = {G1: true, G2: true, G3: true}) {
  const {values: p, problems} = sanitize(input);
  const {N, T, C, B, S, f, R, P1, P2, P3, cdt, cbd} = p;
  const perYear = {co2: N * C / 1000, biomass: N * B, water: N * R / 1000};
  const co2 = perYear.co2 * T, o2 = co2 * O2_PER_CO2, biomass = perYear.biomass * T, shade = N * S * f, water = perYear.water * T;
  const G1 = co2 * P1, G2 = biomass * P2, G3 = water * P3;
  const invest = N * cdt, care = N * cbd * T;
  const gross = (use.G1 ? G1 : 0) + (use.G2 ? G2 : 0) + (use.G3 ? G3 : 0);
  const gainPerYear = (use.G1 ? perYear.co2 * P1 : 0) + (use.G2 ? perYear.biomass * P2 : 0) + (use.G3 ? perYear.water * P3 : 0);
  // Lũy kế theo năm (giả định mỗi năm như nhau, đúng như công thức tuyến tính của đề bài; chi phí trồng tính ở năm đầu)
  const byYear = Array.from({length: T}, (_, i) => {
    const y = i + 1;
    return {year: y, co2: perYear.co2 * y, gross: gainPerYear * y, cost: invest + N * cbd * y, net: gainPerYear * y - invest - N * cbd * y};
  });
  const breakEven = byYear.find(r => r.net >= 0)?.year ?? null;
  return {values: p, problems, use: {...use}, co2, o2, biomass, shade, water, G1, G2, G3, invest, care, gross, net: gross - invest - care, byYear, breakEven: invest + care > 0 ? breakEven : null};
}

/** Diện tích bóng mát so với diện tích xã/phường (km²) → tỉ lệ 0–1, hoặc null. */
export const shareOfArea = (shadeM2, areaKm2) => areaKm2 > 0 ? shadeM2 / (areaKm2 * 1e6) : null;

/** Các dòng kết quả theo thứ tự hiển thị (dùng chung cho thẻ kết quả và CSV). */
export function resultRows(r) {
  return [
    {key: 'co2', sym: 'CO₂', label: 'CO₂ hấp thụ', value: r.co2, unit: 'tấn', digits: 2, formula: 'N × C × T / 1000'},
    {key: 'o2', sym: 'O₂', label: 'O₂ tạo ra (quy đổi)', value: r.o2, unit: 'tấn', digits: 2, formula: 'CO₂ × 0,727'},
    {key: 'biomass', sym: 'B_tổng', label: 'Sinh khối tích lũy', value: r.biomass, unit: 'kg', digits: 0, formula: 'N × B × T'},
    {key: 'shade', sym: 'S_tổng', label: 'Diện tích bóng mát', value: r.shade, unit: 'm²', digits: 0, formula: 'N × S × f'},
    {key: 'water', sym: 'V', label: 'Nước mưa giữ lại', value: r.water, unit: 'm³', digits: 0, formula: 'N × R × T / 1000'},
    {key: 'G1', sym: 'G₁', label: 'Giá trị carbon', value: r.G1, unit: 'đồng', digits: 0, formula: 'CO₂ × P₁', money: true},
    {key: 'G2', sym: 'G₂', label: 'Giá trị sinh khối', value: r.G2, unit: 'đồng', digits: 0, formula: 'B_tổng × P₂', money: true},
    {key: 'G3', sym: 'G₃', label: 'Giá trị nước mưa', value: r.G3, unit: 'đồng', digits: 0, formula: 'V × P₃', money: true},
    {key: 'invest', sym: 'C_đầu tư', label: 'Chi phí trồng', value: r.invest, unit: 'đồng', digits: 0, formula: 'N × c_đt', money: true},
    {key: 'care', sym: 'C_bảo dưỡng', label: 'Chi phí chăm sóc', value: r.care, unit: 'đồng', digits: 0, formula: 'N × c_bd × T', money: true},
    {key: 'net', sym: 'G_tổng', label: 'Tổng lợi ích ròng', value: r.net, unit: 'đồng', digits: 0, formula: [r.use.G1 && 'G₁', r.use.G2 && 'G₂', r.use.G3 && 'G₃'].filter(Boolean).join(' + ') + ' − C_đầu tư − C_bảo dưỡng', money: true},
  ];
}

/** Rút gọn số tiền: 210.000.000 → "210 triệu", 1,2 tỷ… */
export function shortMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  const n = (x, d) => x.toLocaleString('vi-VN', {maximumFractionDigits: d});
  if (a >= 1e9) return `${s}${n(a / 1e9, 2)} tỷ đồng`;
  if (a >= 1e6) return `${s}${n(a / 1e6, 1)} triệu đồng`;
  return `${s}${n(a, 0)} đồng`;
}
