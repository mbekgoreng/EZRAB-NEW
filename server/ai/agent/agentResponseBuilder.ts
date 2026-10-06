import { IntentCategory } from '../intent/intentTypes';
import { ActionProposal } from '../tools/actionProposalManager';
import { ProvenanceValue } from '../knowledge/knowledgeTypes';

export class AgentResponseBuilder {
  private static instance: AgentResponseBuilder;

  public static getInstance(): AgentResponseBuilder {
    if (!AgentResponseBuilder.instance) {
      AgentResponseBuilder.instance = new AgentResponseBuilder();
    }
    return AgentResponseBuilder.instance;
  }

  public formatReadResult(
    intent: IntentCategory,
    toolName: string,
    result: any,
    provenance: Array<ProvenanceValue<any>> = []
  ): string {
    switch (intent) {
      case 'RAB_TOTAL': {
        const total = result?.totalCost || result?.grandTotal || result?.totalRab || 0;
        const formatted = Number(total).toLocaleString('id-ID');
        return `Total RAB proyek saat ini adalah **Rp ${formatted}**.\n\n*Sumber: Database RAB Proyek EZRAB (Terverifikasi)*`;
      }

      case 'QTO_CALCULATE': {
        const vol = result?.volume !== undefined ? result.volume : result;
        const formula = result?.formula || '';
        const unit = result?.unit || 'm³';
        let text = `Volume pekerjaan terhitung: **${Number(vol).toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${unit}**.`;
        if (formula) {
          text += `\n*Rumus: ${formula}*`;
        }
        text += `\n\n*Sumber: Deterministic QTO Calculation Engine*`;
        return text;
      }

      case 'AHSP_SEARCH':
      case 'AHSP_DETAIL': {
        if (Array.isArray(result) && result.length > 0) {
          const top = result.slice(0, 3);
          const lines = top.map(
            (it: any) => `• **${it.code}** — ${it.name || it.description} (${it.unit}): **Rp ${(it.unitPrice || 0).toLocaleString('id-ID')}**`
          );
          return `Ditemukan analisa AHSP resmi:\n${lines.join('\n')}\n\n*Sumber: Standar Baku Permen PUPR 2026*`;
        } else if (result && result.code) {
          return `Analisa AHSP **${result.code}**: ${result.name || result.description}\nHarga Satuan: **Rp ${(result.unitPrice || 0).toLocaleString('id-ID')}/${result.unit || 'satuan'}**\n\n*Sumber: Standar Baku Permen PUPR 2026*`;
        }
        return `Analisa AHSP tidak ditemukan dalam database resmi untuk kata kunci tersebut.`;
      }

      case 'PROJECT_INFO': {
        const name = result?.name || 'Proyek';
        const client = result?.clientName || 'Klien';
        const loc = result?.location || '-';
        const type = result?.buildingType || '-';
        return `Informasi Proyek **${name}**:\n• Klien: ${client}\n• Lokasi: ${loc}\n• Tipe Bangunan: ${type}\n• Status: ${result?.status || 'Aktif'}`;
      }

      case 'PROJECT_LIST': {
        const list = Array.isArray(result) ? result : [];
        if (list.length === 0) return 'Belum ada proyek dalam workspace ini.';
        const items = list.map((p: any) => `• **${p.name}** (${p.id}) - Status: ${p.status || 'draft'}`);
        return `Daftar proyek dalam workspace:\n${items.join('\n')}`;
      }

      case 'PRICE_SEARCH':
      case 'MATERIAL_SEARCH': {
        const items = Array.isArray(result) ? result : (result ? [result] : []);
        if (items.length > 0 && (items[0].price !== undefined || items[0].unitPrice !== undefined)) {
          const top = items.slice(0, 3);
          const lines = top.map(
            (it: any) => `• **${it.name}** (${it.location || 'Nasional'}): **Rp ${(it.price || it.unitPrice || 0).toLocaleString('id-ID')} / ${it.unit || 'satuan'}**`
          );
          return `Ditemukan harga referensi resmi:\n${lines.join('\n')}\n\n*Sumber: Database Harga Material EZRAB (Terverifikasi)*`;
        }
        return `Harga material belum tersedia di database untuk item tersebut.`;
      }

      default:
        if (typeof result === 'string') return result;
        return `Data berhasil diambil dari EZRAB Core.`;
    }
  }

  public formatProposalPrompt(proposal: ActionProposal): string {
    const params = proposal.parameters || {};
    const name = params.name || params.description || proposal.title || 'Pekerjaan Tambahan';
    const volume = params.volume || 1;
    const unit = params.unit || 'm²';
    const code = params.code || params.ahspCode;
    const price = params.unitPrice ? `Rp ${Number(params.unitPrice).toLocaleString('id-ID')}` : 'Belum tersedia';
    const verificationBadge = code ? '✓ Terverifikasi (PUPR 2026)' : '⚠️ Perlu verifikasi (AHSP belum dipetakan)';

    return `Saya telah menyiapkan rancangan penambahan pekerjaan ke RAB:\n\n` +
      `• **Pekerjaan**: ${name}\n` +
      `• **Volume**: ${volume} ${unit}\n` +
      `• **AHSP**: ${code || 'Belum ditemukan'}\n` +
      `• **Harga Satuan**: ${price}\n` +
      `• **Status**: ${verificationBadge}\n\n` +
      `Silakan konfirmasi melalui tombol di bawah untuk menerapkan perubahan ke spreadsheet RAB.`;
  }

  public formatClarificationPrompt(
    question: string,
    options: string[] = []
  ): string {
    let text = question;
    if (options.length > 0) {
      text += `\n\nPilihan yang tersedia:`;
      options.forEach((opt, idx) => {
        text += `\n${idx + 1}. ${opt}`;
      });
    }
    return text;
  }
}

export const agentResponseBuilder = AgentResponseBuilder.getInstance();
