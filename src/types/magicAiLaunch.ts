/**
 * Contract and helper functions for launching EZRAB Magic AI from Dashboard or other views.
 * Ensures initial prompt, project information, and assumptions are preserved across navigation
 * without requiring the user to re-type or re-enter anything (Zero Prompt Retyping).
 */

export interface MagicAiLaunchAssumptions {
  buildingArea?: number;
  landArea?: number;
  floors?: number;
  targetBudget?: number;
  finishingGrade?: 'standar' | 'menengah' | 'mewah';
  soilCondition?: 'normal' | 'lunak' | 'keras';
}

export interface MagicAiLaunchContext {
  projectId: string;
  projectName: string;
  buildingType?: string;
  projectType?: string;
  templateId?: string;
  templateSnapshot?: any;
  parameters?: Record<string, any>;
  location?: string;
  initialPrompt: string;
  source: 'dashboard_hero' | 'create_project_modal' | 'template_selection' | 'quick_action';
  timestamp: number;
  status: 'pending_confirmation' | 'processing' | 'completed';
  assumptions?: MagicAiLaunchAssumptions;
}

const STORAGE_KEY = 'ezrab_magic_ai_launch_context';

export function setMagicAiLaunchContext(ctx: MagicAiLaunchContext): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch (err) {
    console.warn('[MagicAiLaunch] Failed to store launch context in sessionStorage', err);
  }
}

export function getMagicAiLaunchContext(): MagicAiLaunchContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MagicAiLaunchContext;
  } catch (err) {
    console.warn('[MagicAiLaunch] Failed to parse launch context from sessionStorage', err);
    return null;
  }
}

export function clearMagicAiLaunchContext(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[MagicAiLaunch] Failed to clear launch context from sessionStorage', err);
  }
}
