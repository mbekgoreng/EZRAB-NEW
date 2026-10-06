import { AgentExecutionState } from './agentTypes';

export class AgentExecutionStateMachine {
  private currentState: AgentExecutionState = 'RECEIVED';
  private stateHistory: Array<{ state: AgentExecutionState; timestamp: number; note?: string }> = [];

  constructor(initialState: AgentExecutionState = 'RECEIVED') {
    this.currentState = initialState;
    this.stateHistory.push({ state: initialState, timestamp: Date.now() });
  }

  public getState(): AgentExecutionState {
    return this.currentState;
  }

  public getHistory(): Array<{ state: AgentExecutionState; timestamp: number; note?: string }> {
    return [...this.stateHistory];
  }

  public transitionTo(nextState: AgentExecutionState, note?: string): AgentExecutionState {
    const validTransitions: Record<AgentExecutionState, AgentExecutionState[]> = {
      RECEIVED: ['CLASSIFIED', 'CLASSIFICATION_FAILED', 'INVALID_ARGUMENTS', 'TIMEOUT'],
      CLASSIFIED: ['CONTEXT_RESOLVED', 'CONTEXT_FAILED', 'COMPLETED', 'PERMISSION_DENIED', 'CANCELLED', 'TIMEOUT'],
      CONTEXT_RESOLVED: ['PLANNED', 'CONTEXT_FAILED', 'INVALID_ARGUMENTS', 'PERMISSION_DENIED', 'CANCELLED', 'TIMEOUT'],
      PLANNED: ['WAITING_CONFIRMATION', 'EXECUTING', 'COMPLETED', 'INVALID_ARGUMENTS', 'CANCELLED', 'TIMEOUT'],
      WAITING_CONFIRMATION: ['EXECUTING', 'CANCELLED', 'TIMEOUT'],
      EXECUTING: ['VALIDATING', 'COMPLETED', 'TOOL_FAILED', 'TIMEOUT'],
      VALIDATING: ['COMPLETED', 'VALIDATION_FAILED', 'TIMEOUT'],
      COMPLETED: [],
      CLASSIFICATION_FAILED: [],
      CONTEXT_FAILED: [],
      PERMISSION_DENIED: [],
      INVALID_ARGUMENTS: [],
      TOOL_FAILED: [],
      VALIDATION_FAILED: [],
      CANCELLED: [],
      TIMEOUT: []
    };

    const allowed = validTransitions[this.currentState] || [];
    if (!allowed.includes(nextState)) {
      console.warn(`[AgentExecutionStateMachine] Invalid transition attempted: ${this.currentState} -> ${nextState}. Forcing transition.`);
    }

    this.currentState = nextState;
    this.stateHistory.push({ state: nextState, timestamp: Date.now(), note });
    return this.currentState;
  }

  public isTerminal(): boolean {
    const terminalStates: AgentExecutionState[] = [
      'COMPLETED',
      'CLASSIFICATION_FAILED',
      'CONTEXT_FAILED',
      'PERMISSION_DENIED',
      'INVALID_ARGUMENTS',
      'TOOL_FAILED',
      'VALIDATION_FAILED',
      'CANCELLED',
      'TIMEOUT'
    ];
    return terminalStates.includes(this.currentState);
  }
}
