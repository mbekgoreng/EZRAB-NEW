import {
  AIProvider,
  AIProviderCapabilities,
  AIChatOptions,
  AIChatResult,
  ProviderHealth,
  ToolCallRequest
} from './aiProvider';

export class MockAIProvider implements AIProvider {
  public readonly id = 'mock_provider';
  public readonly name = 'EZRAB Mock AI Provider (Deterministic Offline)';
  public readonly type = 'mock' as const;

  public readonly capabilities: AIProviderCapabilities = {
    supportsText: true,
    supportsVision: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsEmbedding: true,
    maxContextTokens: 128000,
    estimatedCostClass: 'free',
    latencyClass: 'fast'
  };

  public async healthCheck(): Promise<ProviderHealth> {
    return {
      providerId: this.id,
      type: this.type,
      status: 'AVAILABLE',
      latencyMs: 1,
      message: 'Mock AI Provider is operational for deterministic test suites',
      lastChecked: new Date().toISOString()
    };
  }

  public supportsTools(): boolean {
    return this.capabilities.supportsTools;
  }

  public supportsVision(): boolean {
    return this.capabilities.supportsVision;
  }

  public supportsStructuredOutput(): boolean {
    return this.capabilities.supportsStructuredOutput;
  }

  public supportsStreaming(): boolean {
    return this.capabilities.supportsStreaming;
  }

  public async chat(options: AIChatOptions): Promise<AIChatResult> {
    const { messages, contextMarkdown } = options;
    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage?.content || '';
    const q = userText.toLowerCase();

    // Check if previous message was a tool result
    const hasToolResult = messages.some(m => m.role === 'tool');

    if (!hasToolResult) {
      // Intent detection for tool calls:
      // 1. RAB Summary
      if (q.includes('total rab') || q.includes('rekap rab') || q.includes('anggaran') || q.includes('ringkasan biaya')) {
        return {
          content: 'Saya akan mengambil rincian data RAB proyek dari database...',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_rab`,
              name: 'get_rab_summary',
              arguments: {}
            }
          ]
        };
      }

      // 2. Kurva S / Keterlambatan
      if (q.includes('kurva s') || q.includes('terlambat') || q.includes('deviasi') || q.includes('progres') || q.includes('jadwal')) {
        return {
          content: 'Saya sedang memeriksa performa Kurva S dan jadwal proyek...',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_kurva`,
              name: 'get_kurva_s',
              arguments: {}
            }
          ]
        };
      }

      // 3. Search AHSP
      if (q.includes('harga satuan') || q.includes('ahsp') || q.includes('analisa') || q.includes('pupr')) {
        return {
          content: 'Mencari analisa harga satuan dalam standar PUPR...',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_ahsp`,
              name: 'search_ahsp',
              arguments: { query: 'beton' }
            }
          ]
        };
      }

      // 4. Cost Anomalies
      if (q.includes('anomali') || q.includes('pemeriksaan rab') || q.includes('audit biaya') || q.includes('cek rab')) {
        return {
          content: 'Melakukan audit otomatis pada item-item RAB proyek...',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_anomaly`,
              name: 'detect_cost_anomalies',
              arguments: { thresholdPercent: 20 }
            }
          ]
        };
      }

      // 5. Add RAB Item (Action requiring confirmation)
      if (q.includes('tambah') && (q.includes('item') || q.includes('pekerjaan'))) {
        return {
          content: 'Saya telah menyiapkan rancangan penambahan item pekerjaan baru ke RAB proyek:',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_add`,
              name: 'add_rab_item',
              arguments: {
                name: 'Pemasangan Pintu Kayu Solid Kamper Kamar Utama',
                category: 'PEKERJAAN KUSEN, PINTU & JENDELA',
                unit: 'unit',
                volume: 2,
                unitPrice: 2850000
              }
            }
          ]
        };
      }

      // 6. Update Progress (Action requiring confirmation)
      if (q.includes('update progress') || q.includes('ubah progres')) {
        return {
          content: 'Saya telah menyiapkan usulan pembaruan progres fisik proyek:',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_prog`,
              name: 'update_progress',
              arguments: {
                newProgress: 45.5,
                note: 'Pengecoran plat lantai 2 telah selesai 100%'
              }
            }
          ]
        };
      }

      // 7. Create Project Report
      if (q.includes('buat laporan') || q.includes('draft laporan') || q.includes('laporan mingguan')) {
        return {
          content: 'Menyiapkan draft laporan mingguan proyek...',
          providerId: this.id,
          modelId: 'mock-deterministic',
          toolCalls: [
            {
              id: `call_${Date.now()}_rep`,
              name: 'create_project_report',
              arguments: { weekNumber: 6 }
            }
          ]
        };
      }
    }

    // If tool was already executed or general response
    const answer = `Berdasarkan data terkini:\n\n${contextMarkdown || ''}\n\nAda yang ingin Anda analisis lebih lanjut terkait RAB, Kurva S, atau AHSP proyek ini?`;

    return {
      content: answer,
      providerId: this.id,
      modelId: 'mock-deterministic',
      tokenUsage: {
        promptTokens: 320,
        completionTokens: 140,
        totalTokens: 460
      }
    };
  }
}
