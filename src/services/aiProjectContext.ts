import type { Project, QTOItem, RabItem, ScheduleTask, WorkItem } from '../types';

const MAX_ITEMS_PER_COLLECTION = 30;

export interface ReadOnlyCollection<T> {
  available: boolean;
  items: T[];
  reason?: string;
}

export interface ReadOnlyProjectContext {
  source: 'frontend_project_context';
  project: {
    available: boolean;
    id: string | null;
    name?: string;
    location?: string;
    status?: string;
    progress?: number;
    reason?: string;
  };
  rab: ReadOnlyCollection<Pick<RabItem, 'id' | 'code' | 'category' | 'description' | 'volume' | 'unit' | 'unitPrice' | 'amount' | 'totalPrice' | 'ahspCode' | 'volumeSource' | 'notes'>> & {
    total: number | null;
    item_count: number | null;
  };
  work_items: ReadOnlyCollection<Pick<WorkItem, 'id' | 'code' | 'category' | 'name' | 'volume' | 'unit' | 'unitPrice' | 'totalAmount' | 'status' | 'ahspCode'>>;
  qto: ReadOnlyCollection<Pick<QTOItem, 'id' | 'kode' | 'uraian' | 'quantity' | 'unit' | 'status' | 'category' | 'calculatorId'>>;
  schedule: ReadOnlyCollection<Pick<ScheduleTask, 'id' | 'name' | 'category' | 'weightPercent' | 'startDate' | 'endDate' | 'actualProgressPercent' | 'status'>>;
  metadata: {
    generated_at: string;
    is_read_only: true;
    contract_version: '1.0';
  };
}

export interface BuildReadOnlyProjectContextInput {
  project: Project | null;
  rabItems?: RabItem[];
  workItems?: WorkItem[];
  qtoItems?: QTOItem[];
  scheduleTasks?: ScheduleTask[];
  question: string;
}

const unavailable = <T,>(reason: string): ReadOnlyCollection<T> => ({ available: false, items: [], reason });

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length >= 3) || [];

function relevant<T>(items: T[], question: string, searchable: (item: T) => string): T[] {
  const queryWords = words(question);
  if (queryWords.length === 0) return items.slice(0, MAX_ITEMS_PER_COLLECTION);
  const matches = items.filter(item => {
    const value = searchable(item).toLowerCase();
    return queryWords.some(word => value.includes(word));
  });
  return matches.slice(0, MAX_ITEMS_PER_COLLECTION);
}

export function buildReadOnlyProjectContext(input: BuildReadOnlyProjectContextInput): ReadOnlyProjectContext {
  const { project, question } = input;
  const metadata = { generated_at: new Date().toISOString(), is_read_only: true as const, contract_version: '1.0' as const };
  if (!project) {
    return {
      source: 'frontend_project_context',
      project: { available: false, id: null, reason: 'Data proyek aktif belum tersedia.' },
      rab: { ...unavailable('Data proyek aktif belum tersedia.'), total: null, item_count: null },
      work_items: unavailable('Data proyek aktif belum tersedia.'),
      qto: unavailable('Data proyek aktif belum tersedia.'),
      schedule: unavailable('Data proyek aktif belum tersedia.'),
      metadata,
    };
  }

  const rabItems = input.rabItems || [];
  const workItems = input.workItems || [];
  const qtoItems = input.qtoItems || [];
  const scheduleTasks = input.scheduleTasks || [];
  const rabTotal = rabItems.reduce((total, item) => total + (item.totalPrice ?? item.amount ?? 0), 0);

  return {
    source: 'frontend_project_context',
    project: { available: true, id: project.id, name: project.name, location: project.location, status: project.status, progress: project.progress },
    rab: {
      available: true,
      total: rabTotal,
      item_count: rabItems.length,
      items: relevant(rabItems, question, item => `${item.code} ${item.category} ${item.description}`).map(item => ({
        id: item.id, code: item.code, category: item.category, description: item.description, volume: item.volume,
        unit: item.unit, unitPrice: item.unitPrice, amount: item.amount, totalPrice: item.totalPrice, ahspCode: item.ahspCode,
        volumeSource: item.volumeSource, notes: item.notes,
      })),
    },
    work_items: {
      available: input.workItems !== undefined,
      items: relevant(workItems, question, item => `${item.code} ${item.category} ${item.name}`).map(item => ({
        id: item.id, code: item.code, category: item.category, name: item.name, volume: item.volume, unit: item.unit,
        unitPrice: item.unitPrice, totalAmount: item.totalAmount, status: item.status, ahspCode: item.ahspCode,
      })),
      ...(input.workItems === undefined ? { reason: 'Data pekerjaan belum tersedia pada konteks proyek saat ini.' } : {}),
    },
    qto: {
      available: input.qtoItems !== undefined,
      items: relevant(qtoItems, question, item => `${item.kode} ${item.uraian} ${item.category || ''}`).map(item => ({
        id: item.id, kode: item.kode, uraian: item.uraian, quantity: item.quantity, unit: item.unit,
        status: item.status, category: item.category, calculatorId: item.calculatorId,
      })),
      ...(input.qtoItems === undefined ? { reason: 'Data QTO belum tersedia pada konteks proyek saat ini.' } : {}),
    },
    schedule: {
      available: input.scheduleTasks !== undefined,
      items: relevant(scheduleTasks, question, item => `${item.name} ${item.category}`).map(item => ({
        id: item.id, name: item.name, category: item.category, weightPercent: item.weightPercent, startDate: item.startDate,
        endDate: item.endDate, actualProgressPercent: item.actualProgressPercent, status: item.status,
      })),
      ...(input.scheduleTasks === undefined ? { reason: 'Data jadwal belum tersedia pada konteks proyek saat ini.' } : {}),
    },
    metadata,
  };
}
