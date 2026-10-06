import { Project, Company } from '../types';
import { exportRABToProfessionalExcel, ExcelExportOptions } from './excelExportEngine';
import { ExportPackageOptions } from './types';

export async function exportProjectToExcel(
  project: Project, 
  company: Company,
  options?: Partial<ExcelExportOptions> | Partial<ExportPackageOptions>
): Promise<Blob> {
  return exportRABToProfessionalExcel(project, company, options);
}

export { exportRABToProfessionalExcel };
export type { ExcelExportOptions, ExportPackageOptions };
