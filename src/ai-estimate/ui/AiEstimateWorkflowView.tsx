/**
 * EZRAB AI ESTIMATE 2.0 — WORKFLOW VIEW
 *
 * Connects directly to the unified professional DedAnalysisDashboard.
 * Eliminates legacy duplicate upload areas and redundant wizard steps.
 */

import React from 'react';
import { Project, RABSection } from '../../types';
import { DedAnalysisDashboard } from '../../components/magic-ai/DedAnalysisDashboard';

export interface AiEstimateWorkflowViewProps {
  currentProject: Project | null;
  projects?: Project[];
  onSelectProject?: (projectId: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onBackToDashboard?: () => void;
  onCommitSuccess?: (sections: RABSection[], grandTotal: number, targetProjectId?: string) => void;
  magicMode?: 'chat' | 'ded-rab';
  onSwitchMode?: (mode: 'chat' | 'ded-rab') => void;
  embedded?: boolean;
}

export const AiEstimateWorkflowView: React.FC<AiEstimateWorkflowViewProps> = ({
  currentProject,
  projects = [],
  onSelectProject,
  onNavigateToTab,
  onBackToDashboard,
  onCommitSuccess,
}) => {
  return (
    <DedAnalysisDashboard
      currentProject={currentProject}
      projects={projects}
      onSelectProject={onSelectProject}
      onNavigateToTab={onNavigateToTab}
      onBackToDashboard={onBackToDashboard}
      onCommitSuccess={onCommitSuccess}
      onOpenRabDetail={(targetProjectId) => {
        const pid = targetProjectId || currentProject?.id;
        if (pid && onSelectProject) {
          onSelectProject(pid);
        }
        if (onNavigateToTab) {
          onNavigateToTab('rab-spreadsheet');
        }
      }}
    />
  );
};

export default AiEstimateWorkflowView;
