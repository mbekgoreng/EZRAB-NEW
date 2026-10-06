import React from 'react';
import {
  UniversalTemplateConfigurator,
  UniversalTemplateConfiguratorProps
} from './UniversalTemplateConfigurator';
import { RabTemplate, DetailLevel } from '../../types/rabTemplate';
import { Project } from '../../types';

export interface ApplyTemplateModalProps extends UniversalTemplateConfiguratorProps {}

/**
 * Universal Workstation Configurator Modal Wrapper
 * Maintains backward compatibility while directing all templates (Rumah, Jalan, Paving, SDA, Gedung,
 * Bangunan Tinggi, Hotel, Kesehatan, Pendidikan, Industri, Utilitas, Landscape, MEP, Renovasi, and Custom)
 * into the 70/30 professional QS workstation interface.
 */
export const ApplyTemplateModal: React.FC<ApplyTemplateModalProps> = (props) => {
  return <UniversalTemplateConfigurator {...props} />;
};

export default ApplyTemplateModal;
