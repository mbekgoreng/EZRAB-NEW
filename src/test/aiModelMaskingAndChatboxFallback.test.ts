import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  maskAiModelName,
  maskAiProviderName,
  sanitizeEvidenceBasis,
  EZRAB_MODEL_FLASH,
  EZRAB_MODEL_VISION,
  EZRAB_MODEL_THINKING,
  EZRAB_PROVIDER_DISPLAY,
} from '../services/aiModelMasking';
import { sanitizeResponseText } from '../services/aiApiClient';
import { defaultAiProvider } from '../services/aiProviderEngine';
import { FullProjectAIContext } from '../services/aiContextService';

describe('EZRAB AI Model Masking & Chatbox Fallback Suite', () => {
  it('1. Correctly masks general fast chat models to ezrab-1.2-flash', () => {
    assert.strictEqual(maskAiModelName('ali/deepseek-v4.1-flash'), EZRAB_MODEL_FLASH);
    assert.strictEqual(maskAiModelName('deepseek-v4.1-flash'), EZRAB_MODEL_FLASH);
    assert.strictEqual(maskAiModelName('qwen3.8-flash'), EZRAB_MODEL_FLASH);
    assert.strictEqual(maskAiModelName('gemini-3.5-flash-lite'), EZRAB_MODEL_FLASH);
    assert.strictEqual(maskAiModelName('gpt-5.6-luna'), EZRAB_MODEL_FLASH);
    assert.strictEqual(maskAiModelName('CHAT'), EZRAB_MODEL_FLASH);
    assert.strictEqual(maskAiModelName('ezrab-1.2-flash'), EZRAB_MODEL_FLASH);
  });

  it('2. Correctly masks vision and drawing models to ezrab-1.0-vision-flash', () => {
    assert.strictEqual(maskAiModelName('gemini-2.0-flash'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('gemini-3.8-flash'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('geminiflash-3.8'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('qwen3.8-omni-flash'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('BACA_DENAH'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('DRAWING_ANALYSIS'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('BACA_NOTA'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('RECEIPT_READING'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('BACA_PDF_DED'), EZRAB_MODEL_VISION);
    assert.strictEqual(maskAiModelName('ezrab-1.0-vision-flash'), EZRAB_MODEL_VISION);
  });

  it('3. Correctly masks reasoning and thinking models to ezrabsuper-v1.5-thinking', () => {
    assert.strictEqual(maskAiModelName('mercury-2.5'), EZRAB_MODEL_THINKING);
    assert.strictEqual(maskAiModelName('claude-opus-4.6-thinking'), EZRAB_MODEL_THINKING);
    assert.strictEqual(maskAiModelName('deepseek-r1'), EZRAB_MODEL_THINKING);
    assert.strictEqual(maskAiModelName('atria-dawn-preview'), EZRAB_MODEL_THINKING);
    assert.strictEqual(maskAiModelName('COMPLEX_REASONING'), EZRAB_MODEL_THINKING);
    assert.strictEqual(maskAiModelName('COMPLEX_ARCHITECTURAL_REASONING'), EZRAB_MODEL_THINKING);
    assert.strictEqual(maskAiModelName('ezrabsuper-v1.5-thinking'), EZRAB_MODEL_THINKING);
  });

  it('4. Masks third-party provider names to EZRAB Cloud Engine', () => {
    assert.strictEqual(maskAiProviderName('gemini'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('vleee'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('zrouter'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('zyrouter'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('inception'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('atria'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('openai'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('deepseek'), EZRAB_PROVIDER_DISPLAY);
    assert.strictEqual(maskAiProviderName('ezrab_core'), 'EZRAB Core');
  });

  it('5. Sanitizes evidence basis to hide raw vendor names and key aliases', () => {
    const rawBasis = 'Extracted via vleee (ali/deepseek-v4.1-flash) [Key: vleee-key-1]';
    const sanitized = sanitizeEvidenceBasis(rawBasis, 'ali/deepseek-v4.1-flash');
    assert.strictEqual(sanitized, 'Diverifikasi melalui EZRAB Cloud Engine (EZRAB AI 1.3)');
    assert.strictEqual(sanitized.includes('vleee'), false);
    assert.strictEqual(sanitized.includes('deepseek'), false);
    assert.strictEqual(sanitized.includes('Key:'), false);
  });

  it('6. Sanitizes raw text to mask accidental vendor names in AI responses', () => {
    const rawAiOutput = 'Sebagai asisten AI berbasis deepseek-v4.1-flash, saya dapat membantu Anda menghitung volume.';
    const sanitized = sanitizeResponseText(rawAiOutput);
    assert.strictEqual(sanitized.includes('deepseek'), false);
    assert.strictEqual(sanitized.includes('EZRAB AI 1.3'), true);
  });

  it('7. AI Engine chat handles queries with graceful fallback or response', async () => {
    const dummyContext: any = {
      currentPage: 'rab-estimasi',
      project: {
        id: 'proj-test-001',
        name: 'Proyek Ruko Thamrin',
        location: 'Jakarta Pusat',
        budget: 500000000,
        timeline: '6 Bulan',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
      },
      rab: {
        totalRab: 450000000,
        totalItems: 25,
        categories: [],
        highestCostItem: null,
        topCostItems: [],
        missingPriceItems: [],
        zeroVolumeItems: [],
      },
      curveS: {
        plannedProgress: 50,
        actualProgress: 48,
        deviation: -2,
        status: 'BEHIND_SCHEDULE',
        statusLabel: 'Terlambat',
        totalWeeks: 24,
        currentWeek: 12,
        dataPoints: [],
      },
      schedule: {
        totalTasks: 10,
        completedTasks: [],
        activeTasks: [],
        pendingTasks: [],
        criticalTasks: [],
      },
      reports: {
        projectName: 'Proyek Ruko Thamrin',
        clientName: 'Owner Ruko',
        location: 'Jakarta Pusat',
        currentDate: '2026-03-01',
        periodLabel: 'Minggu ke-12',
        actualProgress: 48,
        plannedProgress: 50,
        deviation: -2,
        totalCost: 450000000,
        completedWorks: [],
        activeWorks: [],
        upcomingWorks: [],
        potentialIssues: [],
      },
      user: {
        role: 'ESTIMATOR',
      },
    } as unknown as FullProjectAIContext;

    // Test a general query that triggers neural/fallback routing
    const res = await defaultAiProvider.chat(
      'Bagaimana tips memilih semen terbaik untuk struktur beton bertulang?',
      dummyContext
    );

    assert.ok(res.content);
    assert.strictEqual(typeof res.content, 'string');
    assert.ok(res.content.length > 20);
    // Never leak raw vendor names
    assert.strictEqual(res.content.includes('openai'), false);
    assert.strictEqual(res.content.includes('vleee'), false);
  });
});
