// Local demonstration of reviewed workflow updates. No backend calls or execution.
export const copy = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function mergeWorkflow(base, local, incoming, path = '') {
  if (equal(local, base) || equal(local, incoming)) return {value: copy(incoming), conflicts: []};
  if (equal(incoming, base)) return {value: copy(local), conflicts: []};
  if (object(base) && object(local) && object(incoming)) {
    const value = {}, conflicts = [];
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(incoming)])) {
      const result = mergeWorkflow(base[key], local[key], incoming[key], path ? `${path}.${key}` : key);
      if (result.value !== undefined) value[key] = result.value;
      conflicts.push(...result.conflicts);
    }
    return {value, conflicts};
  }
  return {value: copy(local), conflicts: [path]};
}

export function differences(before, after, path = '') {
  if (equal(before, after)) return [];
  if (object(before) && object(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .flatMap(key => differences(before[key], after[key], path ? `${path}.${key}` : key));
  return [{path, before: copy(before), after: copy(after)}];
}

// GPU and run limits are project bindings, not reusable library settings.
export function reusableWorkflow(value) {
  const {gpuLimit, runLimit, ...template} = copy(value);
  return template;
}

export function createWorkflowPreview(initial) {
  const state = {
    draft: copy(initial), revision: 0, history: [],
    targets: {
      current: {name: 'This demo workspace', value: copy(initial), base: copy(initial), revision: 0, libraryId: 1},
      linked: {name: 'Second demo task', value: {...copy(initial), interval: 15}, base: copy(initial), revision: 0, libraryId: 1},
      future: {name: 'Future demo tasks', value: copy(initial), base: copy(initial), revision: 0, libraryId: 1},
    },
  };
  return {
    state,
    stage(value) { state.draft = copy(value); state.revision++; },
    preview(ids, libraryId = 1) {
      if (!ids.length) throw Error('Choose at least one task to review.');
      const targets = [...new Set(ids)].map(id => {
        const target = state.targets[id];
        if (!target) throw Error('Unknown demo task.');
        const merged = mergeWorkflow(target.base, target.value, state.draft);
        return {id, name: target.name, linkChange: libraryId !== target.libraryId, revision: target.revision, value: merged.value,
          conflicts: merged.conflicts, changes: differences(target.value, merged.value),
          preserved: differences(state.draft, merged.value).filter(d => !merged.conflicts.includes(d.path))};
      });
      return {libraryId, revision: state.revision, draft: copy(state.draft), targets,
        canApply: targets.every(t => !t.conflicts.length) && targets.some(t => t.changes.length || t.linkChange)};
    },
    apply(receipt) {
      if (!receipt || !receipt.canApply) throw Error('Resolve conflicts or make a change before applying.');
      if (receipt.revision !== state.revision || receipt.targets.some(t => state.targets[t.id].revision !== t.revision)) {
        throw Error('The proposal or a task changed. Review the changes again.');
      }
      const batch = {before: {}, after: {}, count: receipt.targets.length};
      for (const target of receipt.targets) {
        batch.before[target.id] = copy(state.targets[target.id]);
        Object.assign(state.targets[target.id], {value: copy(target.value), base: copy(receipt.draft), revision: target.revision + 1, libraryId: receipt.libraryId});
        batch.after[target.id] = state.targets[target.id].revision;
      }
      state.history.push(batch);
      return batch;
    },
    undo() {
      const batch = state.history.at(-1);
      if (!batch) throw Error('There is no change to undo.');
      if (Object.entries(batch.after).some(([id, revision]) => state.targets[id].revision !== revision)) {
        throw Error('A task changed after this update. Review it before undoing.');
      }
      for (const [id, target] of Object.entries(batch.before)) {
        state.targets[id] = {...copy(target), revision: state.targets[id].revision + 1};
      }
      state.history.pop();
      // Keep receipts stale, but permit undoing consecutive batches made by this preview.
      const previous = state.history.at(-1);
      if (previous) for (const id of Object.keys(batch.before)) {
        if (id in previous.after) previous.after[id] = state.targets[id].revision;
      }
      state.revision++;
      return batch;
    },
  };
}
