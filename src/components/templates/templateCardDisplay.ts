/**
 * templateCardDisplay — derivasi tampilan per kartu template, diekstrak
 * VERBATIM dari TemplateRabCatalogView (Gelombang Native 2, 2026-11-10)
 * agar kartu desktop dan kartu native mobile (MobileTemplateRab) memakai
 * ikon, pratinjau generate, dan kesiapan pemetaan AHSP yang sama persis —
 * tidak ada perhitungan ulang di presentasi mobile.
 */
import { RabTemplate, TemplateCategory, DetailLevel, TemplateMappingReadiness } from '../../types/rabTemplate';
import { RabTemplateService } from '../../services/rabTemplateService';

export interface TemplateCardDisplay {
  Icon: any;
  isUser: boolean;
  previewRes: ReturnType<RabTemplateService['generateRabFromTemplate']> | null;
  readiness: TemplateMappingReadiness | null;
}

export const deriveTemplateCardDisplay = (
  tplService: RabTemplateService,
  tpl: RabTemplate,
  globalDetailLevel: DetailLevel,
  getCategoryIcon: (cat: TemplateCategory) => any
): TemplateCardDisplay => {
  const Icon = getCategoryIcon(tpl.category);
  const isUser = tpl.metadata.source === 'USER_TEMPLATE' || tpl.metadata.source === 'USER';

  // Real-time calculation based on global detail level
  const defaultParams: Record<string, any> = {};
  for (const p of tpl.parameters) {
    defaultParams[p.key] = p.defaultValue !== undefined ? p.defaultValue : 0;
  }
  let previewRes: TemplateCardDisplay['previewRes'] = null;
  try {
    previewRes = tplService.generateRabFromTemplate(tpl, defaultParams, undefined, globalDetailLevel);
  } catch {}

  // Katalog 180 (Fase H): kesiapan pemetaan AHSP dihitung dari
  // katalog kanonis (bukan kosmetik) — murah: lookup kode+satuan.
  let readiness: TemplateMappingReadiness | null = null;
  try {
    if (!isUser) readiness = tplService.getTemplateMappingReadiness(tpl);
  } catch {}

  return { Icon, isUser, previewRes, readiness };
};
