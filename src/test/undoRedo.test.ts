/**
 * Undo/Redo logic tests — pure function simulation of the stack behavior.
 * Tests the core invariants without React.
 */
import { describe, it, expect } from 'vitest';

// Simulate the undo/redo stacks
function createUndoRedo() {
  const undoStack: any[][] = [];
  const redoStack: any[][] = [];
  let items: any[] = [];
  const MAX = 50;

  const pushSnapshot = () => {
    undoStack.push([...items]);
    if (undoStack.length > MAX) undoStack.shift();
    redoStack.length = 0;
  };
  const setItems = (next: any[]) => { items = next; };
  const undo = () => {
    const prev = undoStack.pop();
    if (!prev) return false;
    redoStack.push([...items]);
    items = prev;
    return true;
  };
  const redo = () => {
    const next = redoStack.pop();
    if (!next) return false;
    undoStack.push([...items]);
    items = next;
    return true;
  };
  return {
    pushSnapshot, setItems, undo, redo,
    get items() { return items; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get undoDepth() { return undoStack.length; },
  };
}

describe('Undo/Redo core', () => {
  it('1. Create → Undo → Redo', () => {
    const u = createUndoRedo();
    u.pushSnapshot(); u.setItems([{ id: '1' }]);
    expect(u.items.length).toBe(1);
    expect(u.undo()).toBe(true);
    expect(u.items.length).toBe(0);
    expect(u.redo()).toBe(true);
    expect(u.items.length).toBe(1);
  });

  it('2. Bulk add → Undo (single step)', () => {
    const u = createUndoRedo();
    u.pushSnapshot(); u.setItems([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(u.undoDepth).toBe(1); // single snapshot for bulk
    u.undo();
    expect(u.items.length).toBe(0);
  });

  it('3. Update → Undo → Redo', () => {
    const u = createUndoRedo();
    u.setItems([{ id: '1', vol: 10 }]);
    u.pushSnapshot(); u.setItems([{ id: '1', vol: 20 }]);
    expect(u.items[0].vol).toBe(20);
    u.undo();
    expect(u.items[0].vol).toBe(10);
    u.redo();
    expect(u.items[0].vol).toBe(20);
  });

  it('4. Delete → Undo → Redo', () => {
    const u = createUndoRedo();
    u.setItems([{ id: '1' }, { id: '2' }]);
    u.pushSnapshot(); u.setItems([{ id: '1' }]);
    u.undo();
    expect(u.items.length).toBe(2);
    u.redo();
    expect(u.items.length).toBe(1);
  });

  it('6. Undo until empty', () => {
    const u = createUndoRedo();
    u.pushSnapshot(); u.setItems([{ id: '1' }]);
    u.pushSnapshot(); u.setItems([{ id: '1' }, { id: '2' }]);
    expect(u.undo()).toBe(true);
    expect(u.undo()).toBe(true);
    expect(u.undo()).toBe(false); // empty
    expect(u.canUndo).toBe(false);
  });

  it('7. Redo until empty', () => {
    const u = createUndoRedo();
    u.pushSnapshot(); u.setItems([{ id: '1' }]);
    u.undo();
    expect(u.redo()).toBe(true);
    expect(u.redo()).toBe(false);
    expect(u.canRedo).toBe(false);
  });

  it('8. New mutation after undo clears redo', () => {
    const u = createUndoRedo();
    u.pushSnapshot(); u.setItems([{ id: '1' }]);
    u.undo();
    expect(u.canRedo).toBe(true);
    u.pushSnapshot(); u.setItems([{ id: '2' }]); // new mutation
    expect(u.canRedo).toBe(false);
  });

  it('9. Snapshot not mutated by later changes', () => {
    const u = createUndoRedo();
    const original = [{ id: '1', vol: 10 }];
    u.setItems(original);
    u.pushSnapshot();
    // Mutate via new array (like React does)
    u.setItems([{ id: '1', vol: 99 }]);
    u.undo();
    expect(u.items[0].vol).toBe(10);
    // Original snapshot item not affected
    expect(original[0].vol).toBe(10);
  });

  it('12. Disabled state reflects history', () => {
    const u = createUndoRedo();
    expect(u.canUndo).toBe(false);
    expect(u.canRedo).toBe(false);
    u.pushSnapshot(); u.setItems([{ id: '1' }]);
    expect(u.canUndo).toBe(true);
    u.undo();
    expect(u.canRedo).toBe(true);
  });
});
