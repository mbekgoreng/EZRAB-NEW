import type { ProjectScopedEntity } from './types';
export class ProjectDataRepository<T extends ProjectScopedEntity> {
  private memory: T[] = [];
  constructor(private readonly domain: string, private readonly projectId: string) {}
  private key() { return `ezrab:project:${this.projectId}:${this.domain}`; }
  list(): T[] { if (typeof localStorage === 'undefined') return [...this.memory]; try { return JSON.parse(localStorage.getItem(this.key()) || '[]') as T[]; } catch { return []; } }
  save(entity: T): T { if (entity.projectId !== this.projectId) throw new Error('PROJECT_ISOLATION_VIOLATION'); const values = this.list().filter(x => x.id !== entity.id); values.push(entity); this.memory = values; if (typeof localStorage !== 'undefined') localStorage.setItem(this.key(), JSON.stringify(values)); return entity; }
  update(id: string, updates: Partial<T>): T | undefined { const entity = this.list().find(x => x.id === id); return entity ? this.save({ ...entity, ...updates, projectId: this.projectId, updatedAt: new Date().toISOString() }) : undefined; }
  remove(id: string) { const values = this.list().filter(x => x.id !== id); if (typeof localStorage !== 'undefined') localStorage.setItem(this.key(), JSON.stringify(values)); }
}
export const createProjectEntity = <T extends ProjectScopedEntity>(projectId: string, data: Omit<T, keyof ProjectScopedEntity>): T => { const now = new Date().toISOString(); return { ...data, id: `${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, projectId, createdAt: now, updatedAt: now } as T; };