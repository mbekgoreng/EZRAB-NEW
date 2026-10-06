import { MaterialMaster } from '../../domain/material/types';

/**
 * Returns a high-quality, authentic construction material image URL
 * based on material taxonomy, code, and keywords.
 */
export const getMaterialThumbnail = (mat: MaterialMaster): string => {
  const code = (mat.materialCode || '').toUpperCase();
  const name = (mat.name || '').toLowerCase();
  const cat = (mat.category || '').toLowerCase();

  // 1. Portland Cement (Semen Gresik & Tiga Roda local generated high-res images)
  if (code.includes('CEM-0001') || (name.includes('semen') && name.includes('gresik'))) {
    return '/assets/materials/semen_gresik.jpg';
  }
  if (code.includes('CEM-0002') || (name.includes('semen') && (name.includes('tiga roda') || name.includes('pozzolan')))) {
    return '/assets/materials/semen_tiga_roda.jpg';
  }
  if (name.includes('semen') || cat.includes('semen')) {
    return '/assets/materials/semen_gresik.jpg';
  }

  // 2. Foundation Stone / Batu Belah
  if (code.includes('STN') || name.includes('batu belah') || name.includes('batu kali')) {
    return '/assets/materials/batu_belah.jpg';
  }

  // 3. Steel Rebar / Besi Beton
  if (code.includes('STE') || name.includes('besi beton') || name.includes('baja tulangan') || name.includes('wiremesh')) {
    return 'https://images.unsplash.com/photo-1535813547-99c456a41d4a?w=200&auto=format&fit=crop&q=80';
  }

  // 4. PVC Piping / Pipa PVC
  if (code.includes('PVC') || name.includes('pipa') || name.includes('rucika') || name.includes('wavin')) {
    return 'https://images.unsplash.com/photo-1542013936693-884638332954?w=200&auto=format&fit=crop&q=80';
  }

  // 5. Electrical Cables / Kabel Listrik
  if (code.includes('CAB') || code.includes('ELE') || name.includes('kabel') || name.includes('supreme')) {
    return 'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=200&auto=format&fit=crop&q=80';
  }

  // 6. Sand / Pasir
  if (code.includes('SND') || name.includes('pasir')) {
    return 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&auto=format&fit=crop&q=80';
  }

  // 7. Paint / Cat Tembok
  if (code.includes('PNT') || name.includes('cat') || name.includes('dulux') || name.includes('nippon')) {
    return 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=200&auto=format&fit=crop&q=80';
  }

  // 8. Bricks / Bata Ringan / Hebel
  if (code.includes('BRK') || name.includes('bata') || name.includes('hebel')) {
    return 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=200&auto=format&fit=crop&q=80';
  }

  // 9. Timber / Kayu
  if (code.includes('TIM') || name.includes('kayu') || name.includes('kaso') || name.includes('balok')) {
    return 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=200&auto=format&fit=crop&q=80';
  }

  // 10. Ceramic / Keramik / Granit
  if (name.includes('keramik') || name.includes('granit') || name.includes('ubin')) {
    return 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200&auto=format&fit=crop&q=80';
  }

  // 11. Roof Tiles / Genteng / Spandek
  if (name.includes('genteng') || name.includes('atap') || name.includes('spandek')) {
    return 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=200&auto=format&fit=crop&q=80';
  }

  // Default fallback to clean local cement image
  return '/assets/materials/semen_gresik.jpg';
};
