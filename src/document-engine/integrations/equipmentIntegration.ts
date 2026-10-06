import type { ProjectEquipment } from '../../project-data/types';

export const mapEquipmentRows = (items: Array<ProjectEquipment | Record<string, any>> = []) =>
  items.map((x: any) => ({
    name: x.name,
    type: x.type,
    specification: x.specification ?? x.capacity,
    quantity: x.quantity ?? 1,
    capacity: x.capacity,
    ownership: x.ownership ?? x.owner,
    condition: x.condition ?? 'Baik',
    availability: x.availability ?? 'Tersedia',
  }));