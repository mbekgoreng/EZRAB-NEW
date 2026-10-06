export const MASCOT_VIEW_BOX = "4000 10500 12000 11500";

// Centers in SVG coordinate space
export const LEFT_EYE_CX = 9700;
export const LEFT_EYE_CY = 16479;
export const RIGHT_EYE_CX = 12295;
export const RIGHT_EYE_CY = 16616;
export const MASCOT_CX = 9966;
export const MASCOT_CY = 16280;

// Maximum pupil displacement in SVG coordinate space (~9-10% of eye area)
export const MAX_EYE_OFFSET_X = 250;
export const MAX_EYE_OFFSET_Y = 220;

export const FACE_PATH_D =
  "M14579.85 16352.91c281.83,2556.61 -1648.89,4252.57 -3969.62,4441.8 -1292.54,105.39 -2544.34,-329.86 -3256.74,-967.93 -1370.34,-1227.36 -1436.04,-3101.93 -1198.71,-4933.06 332.31,-2563.9 225.69,-2434.09 1585.53,-1627.92 612.32,363.01 1044.34,270.63 1741.05,85.43 1212.7,-322.37 2520.05,-166.62 3478.33,405.61 781.75,466.81 1481.45,1337.69 1620.16,2596.07z";

export const BODY_OUTLINE_PATH_D =
  "M14579.85 16352.91c-138.71,-1258.38 -838.41,-2129.26 -1620.16,-2596.07 -958.28,-572.23 -2265.63,-727.98 -3478.33,-405.61 -696.71,185.2 -1128.73,277.58 -1741.05,-85.43 -1359.84,-806.17 -1253.22,-935.98 -1585.53,1627.92 -237.33,1831.13 -171.63,3705.7 1198.71,4933.06 712.4,638.07 1964.2,1073.32 3256.74,967.93 2320.73,-189.23 4251.45,-1885.19 3969.62,-4441.8zm-4595.66 5162.42c-2111.76,-162.14 -3926.15,-1518.78 -4803.11,-3216.41 -899.29,-1740.84 -533.7,-3921.92 -240.46,-5790.16 69.35,-441.79 104.15,-734.17 354.26,-985.26 686.67,-689.34 1393.64,-154.47 1889.86,147.44 330.41,201.03 539.65,362.02 1042.97,245.61 380.84,-88.07 674.79,-187.09 1097.25,-240.89 1694.26,-215.79 3141.81,345.51 4053.88,1167.73 754.68,680.32 1779.09,1926.37 1932.47,3428.52 339.02,3320.31 -2503.76,5460.21 -5327.12,5243.42z";

export const LEFT_EYE_PATH_D =
  "M10419.12 15655.29c-85,107.56 -253.12,351.02 -69.54,570.12 177.02,211.28 334.51,131.08 569.96,49.66 160.47,1435.85 -1328.87,1605.69 -1825.46,924.42 -774.86,-1063.05 583.08,-2115.49 1325.04,-1544.2z";

export const RIGHT_EYE_PATH_D =
  "M13039.99 15835.49c-56.27,130.01 -168.2,163.01 -156.15,383.22 27.78,507.43 604.49,285 628.08,297.97 94.91,52.18 47.34,391.63 24.04,486.46 -126.41,514.48 -706.95,973.56 -1375.73,723.99 -1175.49,-438.65 -750.19,-2465.67 879.76,-1891.64z";

// Color Palette
export const MASCOT_COLORS = {
  deepNavy: '#0F172A',
  sapphireBase: '#0A1128',
  electricBlue: '#2563EB',
  royalBlue: '#1D4ED8',
  brightBlue: '#3B82F6',
  cyanHighlight: '#38BDF8',
  neonCyanRim: '#00F0FF',
  white: '#FFFFFF',
  porcelain: '#F8FAFC',
  softBlueWhite: '#EFF6FF',
  eyeNavyDark: '#030352',
  eyeNavyDeep: '#02051C',
};

// Contextual Greetings for Speech Bubble
export const CONTEXTUAL_GREETINGS: Record<string, string> = {
  '/proyek': 'Mau saya bantu siapkan proyek? ✨',
  '/rab': 'Mau bantu buat atau cek RAB? 📊',
  '/analisis-ded': 'Mau saya bantu membaca DED? 📐',
  '/ahsp': 'Mau cari item AHSP? 🔍',
  '/qto': 'Mau hitung volume otomatis? 🧮',
  '/kurva-s': 'Mau update jadwal & Kurva S? 📈',
  '/dashboard': 'Apa yang bisa saya bantu hari ini? 💬',
  default: 'Halo! Aku EZRAB AI ✨',
};
