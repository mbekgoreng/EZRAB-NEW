/**
 * Katalog Template RAB 180 — agregator 128 template resmi baru.
 *
 * Template warisan (52) tetap berada di RabTemplateService.seedOfficialTemplates
 * dan TIDAK diubah. Modul ini hanya menambah definisi baru; service menggabungkan
 * keduanya (id lama tidak pernah ditimpa).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { BUILDING_TEMPLATES_A } from './buildings';
import { BUILDING_TEMPLATES_B } from './buildings2';
import { INFRA_TEMPLATES_A } from './infrastructure';
import { INFRA_TEMPLATES_B } from './infrastructure2';
import { SPECIALTY_TEMPLATES_A } from './specialty1';
import { SPECIALTY_TEMPLATES_B } from './specialty2';
import { SPECIALTY_TEMPLATES_C } from './specialty3';

export const CATALOG_180_TEMPLATES: RabTemplate[] = [
  ...BUILDING_TEMPLATES_A,
  ...BUILDING_TEMPLATES_B,
  ...INFRA_TEMPLATES_A,
  ...INFRA_TEMPLATES_B,
  ...SPECIALTY_TEMPLATES_A,
  ...SPECIALTY_TEMPLATES_B,
  ...SPECIALTY_TEMPLATES_C
];
