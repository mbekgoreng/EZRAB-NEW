/**
 * DatabaseMinimal — MASTER PRICING §11.1.
 *
 * Per desain D7 (§2 audit), permukaan ini kini mendelegasikan ke
 * `MasterDatabaseView`: material/upah/alat dari priceMaster nyata,
 * provenance §4.3, status verifikasi, harga regional, referensi AHSP
 * tertaut, riwayat harga, dan simulasi dampak §9. API props dipertahankan
 * agar pemanggil lama tidak berubah.
 */
import React from 'react';
import { MasterDatabaseView } from '../masterPricing/MasterDatabaseView';

interface Props {
  initialTab?: 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'PROJECT_PRICE';
  onNavigateToTab?: (tab: string) => void;
}

export const DatabaseMinimal: React.FC<Props> = ({ initialTab, onNavigateToTab }) => (
  <MasterDatabaseView initialTab={initialTab} onNavigateToTab={onNavigateToTab} />
);

export default DatabaseMinimal;
