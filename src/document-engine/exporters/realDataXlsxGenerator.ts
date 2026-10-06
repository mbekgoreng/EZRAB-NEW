import type { DocumentData, DocumentDefinition, ProjectMasterData } from '../types';
import { generateXlsx, downloadXlsx } from './xlsxGenerator';

/**
 * Unified entry point wrapper for backward compatibility.
 * Delegates directly to the canonical generateXlsx implementation.
 */
export const generateRealDataXlsx = async (
  definition: DocumentDefinition,
  _master: ProjectMasterData,
  data: DocumentData
): Promise<Blob> => {
  return generateXlsx(definition, data);
};

export const downloadRealDataXlsx = async (
  definition: DocumentDefinition,
  _master: ProjectMasterData,
  data: DocumentData
): Promise<void> => {
  return downloadXlsx(definition, data);
};