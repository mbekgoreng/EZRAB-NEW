import type { DocumentData, DocumentDefinition, DocumentField, ValidationResult } from './types';
import { classifyDocumentFields, buildTemplateContext } from './templateEngine';
import type { DocumentSourceContext } from './documentData';

/**
 * Phase 6: Template-Specific Validation Engine
 * 
 * Validation now checks ONLY the fields that the selected template actually uses.
 * No more generic dependency blocking (e.g., "Duration missing" blocking Surat Penawaran when not used).
 */

// Document-specific required field mapping (template-driven, not generic)
const TEMPLATE_REQUIRED_FIELDS: Record<string, string[]> = {
  // Surat Penawaran - only requires essential document-specific user fields
  // recipient.position and recipient.organization are OPTIONAL per Phase 6 spec
  'offer-letter': [
    'letter.number',
    'letter.date',
    'signatory.name',
    'recipient.name',
  ],
  // Metode Pelaksanaan
  'execution-method': [
    'signatory.name',
  ],
  // BOQ - minimal requirements
  'boq': [
  ],
  // RAB - minimal requirements
  'rab': [
  ],
  // AHSP - minimal requirements
  'ahsp': [
  ],
  // RKK - requires signatory
  'rkk': [
  ],
  // JSA - requires signatory
  'jsa': [
  ],
  // Time Schedule
  'schedule': [
  ],
  // Kurva-S
  'curve-s': [
  ],
  // Default: use field definition
  'default': [],
};

/**
 * Check if a source dependency is available for the document
 */
function checkSourceDependency(
  dep: string,
  data: DocumentData,
  sourceContext?: DocumentSourceContext
): { available: boolean; label: string; missing?: string[] } {
  const lowerDep = dep.toLowerCase();

  // Source data availability checks (template-level dependencies)
  if (lowerDep === 'project' && !String(sourceContext?.master?.projectName || '').trim()) {
    return { available: false, label: 'Project Master', missing: ['projectName'] };
  }

  if (lowerDep === 'rab' && (!data.rab || data.rab.length === 0)) {
    return { available: false, label: 'Data RAB', missing: ['rab'] };
  }

  if (lowerDep === 'boq' && (!data.boq || data.boq.length === 0)) {
    return { available: false, label: 'Data BOQ', missing: [] };
  }

  if (lowerDep === 'schedule' && (!sourceContext?.scheduleTasks || sourceContext.scheduleTasks.length === 0)) {
    return { available: false, label: 'Data Schedule', missing: ['scheduleTasks'] };
  }

  if ((lowerDep === 'kurva-s' || lowerDep === 'curve-s') && (!sourceContext?.scheduleTasks || sourceContext.scheduleTasks.length === 0)) {
    return { available: false, label: 'Data Kurva-S (requires schedule)', missing: ['scheduleTasks'] };
  }

  if (lowerDep === 'ahsp' && (!sourceContext?.projectAhspItems || sourceContext.projectAhspItems.length === 0)) {
    return { available: false, label: 'Data AHSP', missing: ['projectAhspItems'] };
  }

  if (lowerDep === 'rkk' && 
      (!data.rkk || data.rkk.length === 0) &&
      (!sourceContext?.projectRkk || sourceContext.projectRkk.length === 0) &&
      (!sourceContext?.rkk || sourceContext.rkk.length === 0)) {
    return { available: false, label: 'Data RKK', missing: [] };
  }

  if (lowerDep === 'jsa' && 
      (!data.jsa || data.jsa.length === 0) &&
      (!sourceContext?.projectJsa || sourceContext.projectJsa.length === 0) &&
      (!sourceContext?.jsa || sourceContext.jsa.length === 0)) {
    return { available: false, label: 'Data JSA', missing: [] };
  }

  if (lowerDep === 'personnel' && 
      (!data.personnel || data.personnel.length === 0) &&
      (!sourceContext?.projectPersonnel || sourceContext.projectPersonnel.length === 0)) {
    return { available: false, label: 'Data Personil', missing: [] };
  }

  if (lowerDep === 'equipment' && 
      (!data.equipment || data.equipment.length === 0) &&
      (!sourceContext?.projectEquipment || sourceContext.projectEquipment.length === 0)) {
    return { available: false, label: 'Data Peralatan', missing: [] };
  }

  return { available: true, label: dep };
}

/**
 * Get template-specific required fields
 */
function getTemplateRequiredFields(definition: DocumentDefinition): string[] {
  const templateFields = TEMPLATE_REQUIRED_FIELDS[definition.id] || TEMPLATE_REQUIRED_FIELDS.default;
  return templateFields.length > 0 ? templateFields : [];
}

/**
 * Phase 6 Validation: Template-Specific Field Checking
 * 
 * This replaces the old generic validation that blocked export based on
 * unrelated missing fields (e.g., "duration missing" blocking Surat Penawaran).
 */
export const validateDocument = (
  definition: DocumentDefinition,
  data: DocumentData,
  sourceContext?: DocumentSourceContext,
  userValues?: Record<string, unknown>
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check template-specific source dependencies (not all documents need everything)
  const deps = (definition.dependencies || []).map((d) => d.toLowerCase());
  
  for (const dep of deps) {
    // Only validate dependency if this document actually uses it
    const shouldValidate = [
      'project', 'rab', 'boq', 'schedule', 'ahsp',
      'rkk', 'jsa', 'personnel', 'equipment',
    ].includes(dep);

    if (shouldValidate) {
      const result = checkSourceDependency(dep, data, sourceContext);
      if (!result.available) {
        // Only add error if document type actually requires this data
        const commercialDeps = ['rab', 'boq', 'ahsp', 'kurva-s'];
        const hseDeps = ['rkk', 'jsa', 'personnel', 'equipment'];
        const scheduleDeps = ['schedule', 'kurva-s'];
        
        const docUsesData = 
          (['rab', 'boq', 'ahsp'].includes(definition.id) && ['rab', 'boq'].includes(dep)) ||
          (definition.id === 'kurva-s' && ['schedule', 'rab'].includes(dep)) ||
          (['rkk', 'jsa'].includes(definition.id) && hseDeps.includes(dep)) ||
          (definition.id === 'personnel-availability' && dep === 'personnel') ||
          (definition.id === 'equipment-availability' && dep === 'equipment') ||
          (definition.id === 'schedule' && ['schedule'].includes(dep)) ||
          (definition.id === 'offer-letter' && ['project'].includes(dep)) ||
          (['execution-method', 'rab', 'boq'].includes(definition.id) && dep === 'project');

        if (docUsesData) {
          errors.push(`${result.label} ${result.missing?.join(', ') || 'belum tersedia'}`);
        }
      }
    }
  }

  // 2. Template-specific required field validation
  const requiredFieldIds = getTemplateRequiredFields(definition);
  const classification = classifyDocumentFields(definition);
  const allFields = [...classification.autoFields, ...classification.userFields, ...classification.optionalFields];

  // Check each template-required field
  for (const fieldId of requiredFieldIds) {
    const field = allFields.find(f => f.id === fieldId || f.id === fieldId.replace('.', '_'));
    
    if (field && (field.sourceType === 'USER' || field.requirementType === 'REQUIRED_USER' || !field.sourceType)) {
      // Get value from userValues
      let val = userValues?.[fieldId] ?? userValues?.[fieldId.replace('.', '_')] ?? 
                  userValues?.[fieldId.replace('.', '')] ?? '';
      
      // Also check template context if available
      const contextValue = sourceContext?.userFieldValues?.[fieldId] ?? 
                          sourceContext?.userFieldValues?.[fieldId.replace('.', '_')] ?? '';

      // Check fallback from data.company / data.project for common fields
      if (!val && !contextValue) {
        if (fieldId === 'signatory.name' || fieldId === 'signatory_name') {
          val = data.company.signatory || data.project.director || '';
        } else if (fieldId === 'signatory.position' || fieldId === 'signatory_position') {
          val = data.company.signatoryPosition || 'Direktur Utama';
        }
      }

      if (!String(val || contextValue).trim()) {
        errors.push(`${field.label} belum diisi`);
      }
    }
  }

  // 3. Check fields marked as USER in classification (if no template-specific mapping)
  // An explicit template entry with an empty required list means this
  // data-derived template has no additional manual gate. Only definitions
  // without a template-specific entry use the generic field fallback.
  if (!(definition.id in TEMPLATE_REQUIRED_FIELDS)) {
    // Fallback: check classified user fields
    for (const field of classification.userFields) {
      if (field.requirementType === 'OPTIONAL') continue;
      let val = userValues?.[field.id] ?? userValues?.[field.id.replace('.', '_')] ?? '';
      if (!val && (field.id === 'signatory.name' || field.id === 'signatory_name')) {
        val = data.company.signatory || data.project.director || '';
      } else if (!val && (field.id === 'signatory.position' || field.id === 'signatory_position')) {
        val = data.company.signatoryPosition || field.defaultValue || 'Direktur Utama';
      } else if (!val && field.defaultValue) {
        val = field.defaultValue;
      }
      if (field.required && !String(val).trim()) {
        errors.push(`${field.label} belum diisi`);
      }
    }
  }

  // 4. Optional asset warnings (non-blocking) - only when project data exists
  if (data.project.projectName && (!data.project.companyLogo && !data.company.logo)) {
    warnings.push('Logo perusahaan belum tersedia');
  }

  if (data.project.projectName && !data.project.director && !data.company.signatory) {
    warnings.push('Nama penandatangan belum tersedia');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate document against a specific TemplateDefinition
 */
export function validateDocumentAgainstTemplate(
  template: import('./types').TemplateDefinition | undefined,
  definition: DocumentDefinition,
  data: DocumentData,
  sourceContext?: DocumentSourceContext,
  userValues?: Record<string, unknown>
): ValidationResult {
  if (!template || !template.fields || template.fields.length === 0) {
    return validateDocument(definition, data, sourceContext, userValues);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required user fields of this template
  for (const f of template.fields) {
    if (f.type === 'REQUIRED_USER') {
      let val = userValues?.[f.id] ?? userValues?.[f.id.replace('.', '_')] ?? 
                sourceContext?.userFieldValues?.[f.id] ?? sourceContext?.userFieldValues?.[f.id.replace('.', '_')];
      
      if (!val) {
        if (f.id === 'signatory.name' || f.id === 'signatory_name') {
          val = data.company.signatory || data.project.director;
        } else if (f.id === 'signatory.position' || f.id === 'signatory_position') {
          val = data.company.signatoryPosition || f.defaultValue;
        } else if (f.defaultValue) {
          val = f.defaultValue;
        }
      }

      if (!String(val || '').trim()) {
        errors.push(`${f.label} belum diisi`);
      }
    } else if (f.type === 'CONDITIONAL' && f.condition) {
      // If conditional logic applies
      const shouldCheck = userValues?.[f.condition] || sourceContext?.userFieldValues?.[f.condition];
      if (shouldCheck) {
        const val = userValues?.[f.id] ?? sourceContext?.userFieldValues?.[f.id];
        if (!String(val || '').trim()) {
          errors.push(`${f.label} belum diisi`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get export-ready status with specific missing fields
 */
export function getExportStatus(
  definition: DocumentDefinition,
  data: DocumentData,
  sourceContext?: DocumentSourceContext,
  userValues?: Record<string, unknown>
): { ready: boolean; missingFields: string[]; warnings: string[] } {
  const validation = validateDocument(definition, data, sourceContext, userValues);
  const classification = classifyDocumentFields(definition);
  
  // Count auto fields that have data
  const autoFields = classification.autoFields.filter(f => {
    const val = sourceContext?.master?.[f.id as keyof typeof sourceContext.master] ?? 
                sourceContext?.master?.[f.id.replace('.', '_') as keyof typeof sourceContext.master];
    return val !== undefined && val !== null && String(val).trim() !== '';
  });

  const missingFields = validation.errors.map(e => {
    const match = e.match(/([^(]+)\s+belum/);
    return match ? match[1].trim() : e;
  });

  return {
    ready: validation.valid,
    missingFields,
    warnings: validation.warnings,
  };
}

/**
 * Generate user-friendly export message
 */
export function getExportMessage(
  definition: DocumentDefinition,
  data: DocumentData,
  sourceContext?: DocumentSourceContext,
  userValues?: Record<string, unknown>
): { status: string; action: string; details: string[] } {
  const { ready, missingFields, warnings } = getExportStatus(definition, data, sourceContext, userValues);
  const classification = classifyDocumentFields(definition);

  if (ready) {
    return {
      status: 'Dokumen siap diekspor',
      action: 'export',
      details: [
        `Auto-fields: ${classification.autoFields.length} (terisi otomatis)`,
        `User-fields: ${classification.userFields.filter(f => {
          const val = userValues?.[f.id] ?? '';
          return String(val).trim() !== '';
        }).length}/${classification.userFields.length} (terisi)`,
        ...(warnings.length > 0 ? [`Perhatian: ${warnings.join('; ')}`] : []),
      ],
    };
  }

  const fillableFields = missingFields.filter(field => {
    // Check if this is a fillable user field
    return classification.userFields.some(f => 
      f.id === field || f.label.includes(field) || field.includes(f.label)
    );
  });

  return {
    status: 'Belum siap diekspor',
    action: 'fill',
    details: fillableFields.map(field => {
      const fieldDef = classification.userFields.find(f => 
        f.id === field || f.label.includes(field)
      );
      return `• ${fieldDef?.label || field}`;
    }).concat(warnings.map(w => `• [Perhatian] ${w}`)),
  };
}
