import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowPreview, reusableWorkflow} from '../workflow-preview-state.mjs';
const original={workflow:'research',provider:'Codex',interval:10,metrics:['action','dino','depth','tracks'],requirements:{authorization:true,commit:true,pr:true,mfu:true},gpuLimit:4,runLimit:1};
const setup=()=>createWorkflowPreview(original);

test('drafts and review leave measured views unchanged until apply; undo restores both tasks',()=>{
  const p=setup();p.stage({...original,metrics:['action','dino'],provider:'Claude'});
  const review=p.preview(['current','linked']);
  assert.deepEqual(p.state.targets.current.value.metrics,original.metrics);
  assert.equal(review.targets[1].value.interval,15);
  assert.deepEqual(review.targets[1].preserved.map(d=>d.path),['interval']);
  p.apply(review);
  assert.deepEqual(p.state.targets.current.value.metrics,['action','dino']);
  assert.equal(p.state.targets.linked.value.provider,'Claude');
  assert.equal(p.state.targets.linked.value.interval,15);
  p.undo();
  assert.deepEqual(p.state.targets.current.value,original);
  assert.equal(p.state.targets.linked.value.interval,15);
  assert.equal(p.state.targets.linked.value.provider,'Codex');
});
test('an overlapping local edit blocks the entire batch, without partial application',()=>{
  const p=setup();p.stage({...original,interval:20,provider:'Claude'});
  const review=p.preview(['current','linked']);
  assert.equal(review.canApply,false);
  assert.deepEqual(review.targets[1].conflicts,['interval']);
  assert.throws(()=>p.apply(review),/conflicts/);
  assert.equal(p.state.targets.current.value.provider,'Codex');
  assert.equal(p.state.targets.linked.value.interval,15);
});
test('a changed proposal or task invalidates a prior review',()=>{
  const p=setup();p.stage({...original,provider:'Claude'});const review=p.preview(['current']);
  p.stage({...original,provider:'Cursor'});assert.throws(()=>p.apply(review),/Review/);
  const next=p.preview(['current']);p.state.targets.current.revision++;
  assert.throws(()=>p.apply(next),/Review/);
});
test('future defaults do not change existing tasks or their plots',()=>{
  const p=setup();p.stage({...original,metrics:['action']});p.apply(p.preview(['future']));
  assert.deepEqual(p.state.targets.current.value.metrics,original.metrics);
  assert.deepEqual(p.state.targets.future.value.metrics,['action']);
});
test('versions exclude project compute caps and do not alias the live draft',()=>{
  const saved=reusableWorkflow(original);
  assert.equal('gpuLimit' in saved,false);assert.equal('runLimit' in saved,false);
  saved.requirements.mfu=false;assert.equal(original.requirements.mfu,true);
});
test('consecutive batch undo restores settings and library links, while older receipts stay stale',()=>{
  const p=setup();p.stage({...original,provider:'Claude'});
  const first=p.preview(['current'],2);p.apply(first);
  p.stage({...p.state.draft,metrics:['action']});p.apply(p.preview(['current'],3));
  p.undo();assert.equal(p.state.targets.current.libraryId,2);
  p.undo();assert.equal(p.state.targets.current.libraryId,1);
  assert.deepEqual(p.state.targets.current.value,original);
  assert.throws(()=>p.apply(first),/Review/);
});
test('undo rejects intervening task changes and an empty selection cannot apply',()=>{
  const p=setup();assert.throws(()=>p.preview([]),/Choose/);
  p.stage({...original,provider:'Claude'});p.apply(p.preview(['current']));
  p.state.targets.current.revision++;assert.throws(()=>p.undo(),/changed/);
});

test('a task can link to a new library entry even when the settings are identical',()=>{
  const p=setup(),review=p.preview(['current'],2);
  assert.equal(review.canApply,true);assert.equal(review.targets[0].changes.length,0);
  p.apply(review);assert.equal(p.state.targets.current.libraryId,2);
  p.undo();assert.equal(p.state.targets.current.libraryId,1);
});
