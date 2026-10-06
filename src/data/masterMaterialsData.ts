import { PriceItem } from '../types';
import RAW_MATERIALS from './masterMaterials2026.json';

export const MATERIAL_SUBCATEGORIES = [
  'SEMUA KATEGORI',
  'KERAMIK & PORSELEN',
  'BATU, BATA & ROSTER',
  'SEMEN, MORTAR & BETON',
  'BAJA & BESI',
  'CAT',
  'PLAFON & PARTISI',
  'KAYU, MDF & HPL',
  'VINYL, SPC & LAMINATE',
  'PLUMBING & SANITAIR',
  'ELECTRICAL & LIGHTING',
  'ROOFING',
  'FASAD & EXTERIOR',
  'WATERPROOFING & SEALANT',
  'LANDSCAPE & VEGETASI',
  'FURNITURE & INTERIOR',
  'AKUSTIK',
  'FIRE SAFETY'
] as const;

export type MaterialSubcategory = typeof MATERIAL_SUBCATEGORIES[number];

export const MASTER_MATERIALS_2026: PriceItem[] = RAW_MATERIALS as unknown as PriceItem[];
