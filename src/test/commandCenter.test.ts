/**
 * Test: Command Center P0 — intent routing & action registry
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};

describe('P0: intent routing untuk command center', () => {
  it('1. "buatkan saya RAB rumah" → START_RAB_WIZARD', () => {
    const r = routeIntent('buatkan saya RAB rumah');
    expect(r.intent).toBe('START_RAB_WIZARD');
  });

  it('2. "buat desain rumah 90 m2" → START_HOUSE_DESIGN', () => {
    const r = routeIntent('buat desain rumah 90 m2');
    expect(r.intent).toBe('START_HOUSE_DESIGN');
  });

  it('3. "buka menu spreadsheet" → OPEN_SPREADSHEET', () => {
    const r = routeIntent('buka menu spreadsheet');
    expect(r.intent).toBe('OPEN_SPREADSHEET');
  });

  it('4. "buka RAB" tetap → OPEN_RAB (tidak tertelan wizard)', () => {
    const r = routeIntent('buka RAB');
    expect(r.intent).toBe('OPEN_RAB');
  });
});

describe('P0: action registry', () => {
  it('5. START_RAB_WIZARD membuka wizard + action buttons', () => {
    const res = executeIntent('START_RAB_WIZARD', undefined, mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.openRabWizard).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it('6. START_HOUSE_DESIGN membuka design studio', () => {
    const res = executeIntent('START_HOUSE_DESIGN', 'rumah 90 m2', mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.openDesignStudio).toBe(true);
    expect(res.designPrompt).toBe('rumah 90 m2');
  });

  it('7. OPEN_SPREADSHEET memberi tombol navigasi nyata', () => {
    const res = executeIntent('OPEN_SPREADSHEET', undefined, mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.actions && res.actions[0].action.kind).toBe('navigate');
  });

  it('8. Action button navigate menunjuk menu valid', () => {
    const res = executeIntent('OPEN_SPREADSHEET', undefined, mockCtx as never);
    const btn = res.actions![0];
    if (btn.action.kind === 'navigate') {
      expect(btn.action.menu).toBe('rab-estimasi');
    } else {
      throw new Error('Expected navigate action');
    }
  });
});
