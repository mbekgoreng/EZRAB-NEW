/**
 * EZRAB MAGIC AI — MASTER VIEW REPLACEMENT
 *
 * Replaces the legacy chat-first / mascot interface with the professional
 * Engineering Construction Estimating & DED Analysis Dashboard.
 *
 * Adheres strictly to:
 * - Desktop-first engineering software UX
 * - No chatbot bubbles, no mascots, no AI slop
 * - Full integration with aiEstimatePipeline & project contexts
 */

import React from 'react';
import { Project, RabItem, ScheduleTask, KurvaSDataPoint, RABSection } from '../../types';
import { DedAnalysisDashboard } from './DedAnalysisDashboard';

export interface MagicAiSuperViewProps {
  initialMode?: 'chat' | 'ded-rab' | 'dokumen-ai';
  onBackToDashboard?: () => void;
  onOpenRabDetail?: (targetProjectId?: string) => void;
  currentProject?: Project | null;
  projects?: Project[];
  projectRabItems?: RabItem[];
  projectScheduleTasks?: ScheduleTask[];
  projectKurvaSData?: KurvaSDataPoint[];
  onSelectProject?: (projectId: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onAddRabItemDirect?: (
    item: Partial<RabItem> & {
      description: string;
      volume: number;
      unit: string;
      unitPrice?: number;
      ahspCode?: string;
      category?: string;
    }
  ) => void;
  onOpenFloatingChat?: () => void;
}

export const MagicAiSuperView: React.FC<MagicAiSuperViewProps> = ({
  currentProject,
  projects = [],
  onSelectProject,
  onNavigateToTab,
  onBackToDashboard,
  onOpenRabDetail,
}) => {
  return (
    <DedAnalysisDashboard
      currentProject={currentProject}
      projects={projects}
      onSelectProject={onSelectProject}
      onNavigateToTab={onNavigateToTab}
      onBackToDashboard={onBackToDashboard}
      onOpenRabDetail={onOpenRabDetail}
      onCommitSuccess={(sections: RABSection[], grandTotal: number, targetProjectId?: string) => {
        const pid = targetProjectId || currentProject?.id;
        if (pid && onSelectProject) {
          onSelectProject(pid);
        }
        if (onOpenRabDetail) {
          onOpenRabDetail(pid);
        } else if (onNavigateToTab) {
          onNavigateToTab('rab-spreadsheet');
        }
      }}
    />
  );
};

export default MagicAiSuperView;
