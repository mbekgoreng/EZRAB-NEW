import { AIMessage } from '../../database/types';

export interface AuthoritativeSessionContext {
  userId: string;
  workspaceId: string;
  projectId?: string;
  projectName?: string;
  userRole?: string;
  currentRoute?: string;
  currentModule?: string;
  selectedRabItemId?: string;
  selectedWbsCode?: string;
  permissions: string[];
  entitlement: {
    plan: 'free' | 'trial' | 'pro' | 'enterprise';
    canExportPdf: boolean;
    canUseVision: boolean;
    canExecuteMutations: boolean;
  };
}

export interface AssembledAgentContext {
  session: AuthoritativeSessionContext;
  conversationHistory: AIMessage[];
  systemPrompt: string;
  relevantContextMarkdown: string;
  availableTools: any[];
  isProjectAuthorized: boolean;
  validationError?: string;
}
