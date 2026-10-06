/**
 * Specialized Agent Registry & Contract Engine (Priority 4)
 *
 * Defines 11 specialized construction agents with bounded tool access,
 * role authorizations, domain scopes, timeouts, token limits, and failure policies.
 */

export interface AgentContract {
  agentId: string;
  name: string;
  purpose: string;
  allowedTools: string[];
  allowedRoles: string[];
  allowedDomains: string[];
  maxSteps: number;
  timeoutMs: number;
  budgetLimitTokens: number;
  requiresHumanApproval: boolean;
  outputSchema: Record<string, any>;
  failurePolicy: 'FAIL_SAFE' | 'RETRY_IDEMPOTENT' | 'FALLBACK_TOOL' | 'HALT_FOR_USER';
}

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, AgentContract> = new Map();

  private constructor() {
    this.registerAllSpecializedAgents();
  }

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  private registerAllSpecializedAgents(): void {
    // 1. RAB AGENT
    this.agents.set('agent_rab', {
      agentId: 'agent_rab',
      name: 'RAB Specialist Agent',
      purpose: 'Menyusun rincian anggaran biaya, perhitungan subtotal, overhead, dan profit.',
      allowedTools: ['get_rab', 'get_rab_items', 'add_rab_item', 'update_rab_item', 'get_ahsp', 'get_material_prices'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 10,
      timeoutMs: 30000,
      budgetLimitTokens: 16000,
      requiresHumanApproval: true,
      outputSchema: { type: 'object', properties: { grandTotal: { type: 'number' }, itemsCount: { type: 'number' } } },
      failurePolicy: 'RETRY_IDEMPOTENT'
    });

    // 2. QTO AGENT
    this.agents.set('agent_qto', {
      agentId: 'agent_qto',
      name: 'QTO Volume Specialist Agent',
      purpose: 'Menghitung volume pekerjaan dari formula geometri dan elemen DED yang disetujui.',
      allowedTools: ['calculate_volume', 'get_project', 'get_ded_elements'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 8,
      timeoutMs: 25000,
      budgetLimitTokens: 12000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { totalVolumeSum: { type: 'number' } } },
      failurePolicy: 'FAIL_SAFE'
    });

    // 3. DED AGENT
    this.agents.set('agent_ded', {
      agentId: 'agent_ded',
      name: 'DED Vision & Blueprint Agent',
      purpose: 'Menganalisis gambar kerja teknik, denah, potongan, dan catatan DED.',
      allowedTools: ['extract_ded_elements', 'resolve_ded_conflict'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 12,
      timeoutMs: 45000,
      budgetLimitTokens: 20000,
      requiresHumanApproval: true,
      outputSchema: { type: 'object', properties: { approvedElementsCount: { type: 'number' } } },
      failurePolicy: 'HALT_FOR_USER'
    });

    // 4. SCHEDULE AGENT
    this.agents.set('agent_schedule', {
      agentId: 'agent_schedule',
      name: 'Time Schedule Planner Agent',
      purpose: 'Menyusun jadwal waktu pelaksanaan, durasi pekerjaan, dan urutan dependensi.',
      allowedTools: ['get_schedule', 'create_schedule', 'add_schedule_activity', 'create_wbs'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 8,
      timeoutMs: 20000,
      budgetLimitTokens: 10000,
      requiresHumanApproval: true,
      outputSchema: { type: 'object', properties: { totalWeeks: { type: 'number' } } },
      failurePolicy: 'RETRY_IDEMPOTENT'
    });

    // 5. CURVE S AGENT
    this.agents.set('agent_curves', {
      agentId: 'agent_curves',
      name: 'Curve S & Progress Monitoring Agent',
      purpose: 'Menghitung bobot persentase mingguan, kurva S rencana, dan deviasi progress.',
      allowedTools: ['get_curve_s', 'compare_planned_actual_progress'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 6,
      timeoutMs: 15000,
      budgetLimitTokens: 8000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { plannedCumulative: { type: 'number' } } },
      failurePolicy: 'FAIL_SAFE'
    });

    // 6. REPORT AGENT
    this.agents.set('agent_report', {
      agentId: 'agent_report',
      name: 'Executive & Inspection Report Agent',
      purpose: 'Menyusun laporan mingguan, bulanan, dan ekspor resmi dokumen proyek.',
      allowedTools: ['generate_report', 'export_excel', 'export_pdf', 'get_project_reports'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR', 'DIREKSI'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 6,
      timeoutMs: 30000,
      budgetLimitTokens: 12000,
      requiresHumanApproval: true,
      outputSchema: { type: 'object', properties: { reportUrl: { type: 'string' } } },
      failurePolicy: 'RETRY_IDEMPOTENT'
    });

    // 7. QA/QC AGENT
    this.agents.set('agent_qc', {
      agentId: 'agent_qc',
      name: 'QA/QC & Construction Compliance Agent',
      purpose: 'Mengaudit kesesuaian spesifikasi teknis, standar SNI, dan kepatuhan AHSP.',
      allowedTools: ['validate_rab', 'detect_anomalies', 'get_ahsp'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR', 'DIREKSI'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 8,
      timeoutMs: 20000,
      budgetLimitTokens: 10000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { complianceScore: { type: 'number' } } },
      failurePolicy: 'FAIL_SAFE'
    });

    // 8. COST OPTIMIZATION AGENT
    this.agents.set('agent_cost_opt', {
      agentId: 'agent_cost_opt',
      name: 'Cost Optimization & Value Engineering Agent',
      purpose: 'Memberikan rekomendasi penghematan biaya dan perbandingan skenario alternatif.',
      allowedTools: ['compare_rab', 'calculate_material_needs', 'get_material_prices'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 8,
      timeoutMs: 25000,
      budgetLimitTokens: 12000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { calculatedSavings: { type: 'number' } } },
      failurePolicy: 'FAIL_SAFE'
    });

    // 9. PROJECT ASSISTANT AGENT
    this.agents.set('agent_project_assistant', {
      agentId: 'agent_project_assistant',
      name: 'Project Assistant & Navigation Agent',
      purpose: 'Membantu navigasi aplikasi, pencarian data proyek, dan informasi umum.',
      allowedTools: ['get_project', 'list_projects', 'get_project_summary'],
      allowedRoles: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR', 'DIREKSI', 'CLIENT', 'VIEWER'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 5,
      timeoutMs: 10000,
      budgetLimitTokens: 6000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
      failurePolicy: 'FAIL_SAFE'
    });

    // 10. SECURITY REVIEW AGENT
    this.agents.set('agent_security_review', {
      agentId: 'agent_security_review',
      name: 'Security & Tenant Isolation Review Agent',
      purpose: 'Memeriksa sanitasi input, pencegahan prompt injection, dan isolasi tenant.',
      allowedTools: ['audit_security_log', 'validate_tenant_scope'],
      allowedRoles: ['SUPER_ADMIN'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 5,
      timeoutMs: 10000,
      budgetLimitTokens: 4000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { isClean: { type: 'boolean' } } },
      failurePolicy: 'FAIL_SAFE'
    });

    // 11. EVALUATION AGENT
    this.agents.set('agent_evaluation', {
      agentId: 'agent_evaluation',
      name: 'Multi-Agent Evaluation & Benchmark Agent',
      purpose: 'Menilai presisi intent, pemilihan tool, akurasi kalkulasi, dan zero-leakage.',
      allowedTools: ['run_evaluation_benchmark', 'get_agent_metrics'],
      allowedRoles: ['SUPER_ADMIN'],
      allowedDomains: ['BUILDING', 'ROAD', 'WATER', 'CIVIL'],
      maxSteps: 15,
      timeoutMs: 60000,
      budgetLimitTokens: 25000,
      requiresHumanApproval: false,
      outputSchema: { type: 'object', properties: { overallScore: { type: 'number' } } },
      failurePolicy: 'FAIL_SAFE'
    });
  }

  public getAgent(agentId: string): AgentContract | undefined {
    return this.agents.get(agentId);
  }

  public getAllAgents(): AgentContract[] {
    return Array.from(this.agents.values());
  }

  /**
   * Validate if an agent is authorized to execute a specific tool
   */
  public isToolAllowed(agentId: string, toolName: string): boolean {
    const agent = this.getAgent(agentId);
    if (!agent) return false;
    return agent.allowedTools.includes(toolName);
  }
}

export const agentRegistry = AgentRegistry.getInstance();
