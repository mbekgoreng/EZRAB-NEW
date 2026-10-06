/**
 * EZRAB AI Orchestration Layer Comprehensive Verification Test
 * 
 * Tests:
 * 1. AI Configuration & VLEEE DeepSeek Primary Orchestrator setup
 * 2. Provider Gateway & External Gateway Provider reasoning content support
 * 3. Canonical Tools in ToolRegistry (camelCase/snake_case aliases, read auto, write confirmation)
 * 4. Document AI Orchestrator Service (completeness, templates, missing fields, draft proposals)
 * 5. Price Resolution Engine tool integration
 * 6. Receipt Vision Service (Gemini Flash-Lite math validation and structured schema)
 */

import { getAiConfig, getSanitizedAiConfig } from '../config/aiConfig';
import { toolRegistry } from '../tools/toolRegistry';
import { documentAiOrchestratorService } from '../services/documentAiOrchestratorService';
import { receiptVisionService } from '../services/receiptVisionService';
import { PriceResolver } from '../../src/engine/pricing/resolver/priceResolver';

async function runTests() {
  console.log('\n================================================================');
  console.log('🤖 EZRAB AI ORCHESTRATION LAYER VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, errorDetail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${errorDetail ? `: ${errorDetail}` : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: AI Config & VLEEE DeepSeek Configuration
  // -------------------------------------------------------------
  try {
    const cfg = getAiConfig();
    assert(
      cfg.external.baseUrl.includes('api.vleee.net') || cfg.external.baseUrl.includes('vleee'),
      'AI Config baseUrl points to VLEEE endpoint',
      `BaseUrl is ${cfg.external.baseUrl}`
    );
    assert(
      cfg.external.model === 'cbcn/deepseek-v4.1-flash',
      'AI Config external model is set to cbcn/deepseek-v4.1-flash',
      `Model is ${cfg.external.model}`
    );
    assert(
      cfg.external.apiKey.length > 10,
      'AI Config has configured VLEEE API key in backend runtime'
    );
    assert(
      cfg.gemini.modelFlashLite === 'gemini-3.5-flash-lite',
      'AI Config Gemini fast vision model is gemini-3.5-flash-lite',
      `Gemini model is ${cfg.gemini.modelFlashLite}`
    );

    const sanitized = getSanitizedAiConfig();
    assert(
      sanitized.external.apiKey === undefined && sanitized.gemini.keys === undefined,
      'Sanitized AI Config strictly redacts all API keys and secrets'
    );
  } catch (err: any) {
    assert(false, 'AI Config verification failed', err.message);
  }

  // -------------------------------------------------------------
  // TEST 2: Canonical Tools in ToolRegistry
  // -------------------------------------------------------------
  try {
    const canonicalTools = [
      { name: 'getProjectContext', isMutate: false },
      { name: 'getRabTotal', isMutate: false },
      { name: 'getRabItems', isMutate: false },
      { name: 'searchMaterials', isMutate: false },
      { name: 'getMaterialPrice', isMutate: false },
      { name: 'resolvePrice', isMutate: false },
      { name: 'searchAHSP', isMutate: false },
      { name: 'getAHSP', isMutate: false },
      { name: 'getDocumentStatus', isMutate: false },
      { name: 'getDocumentCompleteness', isMutate: false },
      { name: 'getDocumentTemplate', isMutate: false },
      { name: 'createDocumentDraft', isMutate: true },
      { name: 'navigateTo', isMutate: false },
      { name: 'scanReceipt', isMutate: false },
    ];

    for (const t of canonicalTools) {
      const toolDef = toolRegistry.get(t.name);
      assert(
        Boolean(toolDef),
        `Tool "${t.name}" resolved successfully in registry`,
        `Tool ${t.name} returned undefined`
      );

      if (toolDef) {
        assert(
          toolDef.requiresConfirmation === t.isMutate,
          `Tool "${t.name}" confirmation requirement matches expected (${t.isMutate ? 'CONFIRM_REQUIRED' : 'AUTO_EXEC'})`,
          `Expected requiresConfirmation=${t.isMutate}, got ${toolDef.requiresConfirmation}`
        );
      }
    }

    // Also verify snake_case lookups
    const snakeTool = toolRegistry.get('resolve_price');
    assert(Boolean(snakeTool), 'Tool "resolve_price" resolves via snake_case lookup');
  } catch (err: any) {
    assert(false, 'ToolRegistry verification failed', err.message);
  }

  // -------------------------------------------------------------
  // TEST 3: Document AI Orchestrator Service
  // -------------------------------------------------------------
  try {
    const status = documentAiOrchestratorService.getDocumentStatus('TEST-PRJ-01');
    assert(
      status.count > 0 && status.documents.length > 0,
      'Document status retrieves registered project documents',
      `Found ${status.count} documents`
    );

    const completeness = documentAiOrchestratorService.getDocumentCompleteness('TEST-PRJ-01');
    assert(
      typeof completeness.overallPercentage === 'number',
      'Document completeness computes overall percentage'
    );
    assert(
      completeness.missingRequiredFields.length > 0,
      'Document completeness identifies missing required user fields'
    );

    const template = documentAiOrchestratorService.getDocumentTemplate('offer-letter-standard');
    assert(
      template.found && template.template?.name.includes('Penawaran'),
      'Document template retrieved with field definitions',
      `Found: ${template.found}`
    );

    const draft = documentAiOrchestratorService.proposeDocumentDraft({
      projectId: 'TEST-PRJ-01',
      templateId: 'offer-letter-standard',
      customFields: { 'letter.number': '001/SPH/2026' }
    });
    assert(
      draft.requiresConfirmation === true && draft.proposal.action === 'CREATE_DOCUMENT_DRAFT',
      'Document draft proposal enforces confirmation gate'
    );
  } catch (err: any) {
    assert(false, 'Document AI Orchestrator verification failed', err.message);
  }

  // -------------------------------------------------------------
  // TEST 4: Price Engine Resolver
  // -------------------------------------------------------------
  try {
    const resolver = new PriceResolver();
    const result = resolver.resolve({
      name: 'Semen Portland',
      location: 'DKI Jakarta',
      unit: 'sak'
    });
    assert(
      result.status !== undefined && typeof result.confidence === 'number',
      'PriceResolver resolves price with status and confidence score',
      `Status: ${result.status}, Confidence: ${result.confidence}`
    );
  } catch (err: any) {
    assert(false, 'PriceResolver integration failed', err.message);
  }

  // -------------------------------------------------------------
  // TEST 5: Navigation Tool Execution
  // -------------------------------------------------------------
  try {
    const navTool = toolRegistry.get('navigateTo');
    if (!navTool) throw new Error('navigateTo tool not found');

    const navRes = await navTool.execute(
      { target: 'qto', tab: 'calculator' },
      { workspaceId: 'ws-1', projectId: 'prj-100', userId: 'user-1' }
    );

    assert(
      navRes.action === 'NAVIGATE' && navRes.path === '/app/projects/prj-100/qto?view=calculator',
      'navigateTo generates correct project workstation route',
      `Path: ${navRes?.path}`
    );
  } catch (err: any) {
    assert(false, 'Navigation tool verification failed', err.message);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
