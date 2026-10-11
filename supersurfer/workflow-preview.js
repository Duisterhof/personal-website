import {getBoardDraft, setBoardDraft} from './interactive-workspace.js';
import {createWorkflowPreview, reusableWorkflow, copy} from './workflow-preview-state.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metrics = {action:'Action', dino:'DINO', depth:'Depth', tracks:'Tracks'};
const presets = {
  research: {name:'Research', lead:'Research lead', worker:'Experiment worker', steps:[['Implementation','feeds','Experiment'],['Requirements','required by','Experiment'],['W&B data','feeds','Results']], instruction:'Implement the experiment, verify the exact source, and report measured results. Only the manager may launch jobs.'},
  software: {name:'Software engineering', lead:'Technical lead', worker:'Developer', steps:[['Implementation','feeds','Project checks'],['Project checks','required by','App preview'],['App preview','feeds','Review']], instruction:'Implement the feature in the project, run its checks, and report the changes for review.'},
  writing: {name:'Writing · LaTeX & PDF', lead:'Writing lead', worker:'Writing collaborator', steps:[['Paper brief','feeds','Paper source'],['Paper source','feeds','Compile & review PDF'],['Compiled PDF','feeds','Review notes']], instruction:'Work in the paper source, build the PDF, and inspect the rendered pages before reporting the result.'},
};
const preview = createWorkflowPreview(getBoardDraft());
const recordedGuidance=preview.state.draft.guidance;
const library = [{id:1,name:'E19 · research requirements',versions:[reusableWorkflow(preview.state.draft)]}];
let chosen=1, version=1, name=library[0].name, scope='current', receipt=null, message='', applied=false, formDirty=false;
const selectedTasks=new Set(['current','linked']);
const root=$('#workflow-demo');
root.innerHTML=`
  <section class="wf-chat-column" aria-label="Design a workflow">
    <div class="wf-start"><span class="wf-tab-active">Workflow</span><button data-workflow-action="advanced">Advanced ↗</button></div>
    <div class="wf-conversation">
      <span class="tiny-label">Start with the work</span><h3>What do you want <br>to build today?</h3>
      <p class="wf-intro">In the app, describe your goal in chat or choose a saved Surfboard. Review the proposal before using it.</p>
      <div class="wf-presets" aria-label="Workflow presets">${Object.entries(presets).map(([key,p])=>`<button data-preset="${key}" aria-pressed="${key==='research'}">${esc(p.name)}</button>`).join('')}</div>
      <div class="wf-request"><span>From my research sessions</span><blockquote>“Only allow jobs to be launched when mfu is specified”</blockquote><p>That instruction belongs in the workflow, alongside authorization, an exact commit, and a verified PR.</p></div>
      <div class="wf-try"><b>Try shaping the proposal</b><p>This browser example changes the draft directly. The app uses your chosen agent to work through the request with you.</p></div>
      <form id="workflow-form">
        <div class="wf-control-row"><label>Worker provider<select id="workflow-provider"><option>Cursor</option><option selected>Codex</option><option>Claude</option></select></label><label id="workflow-interval-label">Check-in interval<input id="workflow-interval" type="number" min="1" max="1440" value="10" required><small>Minutes · configuration only</small></label></div>
        <fieldset id="workflow-metrics"><legend>Measured objectives in Results</legend>${Object.entries(metrics).map(([key,label])=>`<label><input type="checkbox" name="metric" value="${key}" checked>${label}</label>`).join('')}</fieldset>
        <label id="workflow-mfu-label" class="wf-mfu"><input type="checkbox" id="workflow-mfu" checked> Require an explicit numeric MFU estimate<small>Agent instruction, verified by the manager.</small></label>
        <label>Worker instruction<textarea id="workflow-instruction" rows="3" maxlength="2000"></textarea></label>
        <div class="wf-draft-actions"><button class="primary" type="submit">Update proposal</button><span id="workflow-draft-status" role="status">Try hiding Depth and Tracks, then review.</span></div>
      </form>
    </div>
    <div class="wf-chat-note">Interactive local example · no AI response is being generated.</div>
  </section>
  <aside class="wf-proposal" aria-label="Proposed workflow"></aside>`;

function syncControls(){
  const b=preview.state.draft, research=b.workflow==='research';
  $('#workflow-provider').value=b.provider;
  $('#workflow-interval').value=b.interval;
  $('#workflow-instruction').value=b.workerInstruction;
  $('#workflow-mfu').checked=b.requirements.mfu;
  document.querySelectorAll('[name="metric"]').forEach(el=>el.checked=b.metrics.includes(el.value));
  for(const id of ['workflow-metrics','workflow-mfu-label','workflow-interval-label']) $('#'+id).hidden=!research;
  document.querySelectorAll('[data-preset]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.preset===b.workflow)));
  $('#advanced-board').hidden=!research;
  if(!research) $('#advanced-board').open=false;
  $('.wf-start [data-workflow-action="advanced"]').hidden=!research;
}
function stage(value, notice='Proposal updated. Review where it will apply.'){
  preview.stage(value);setBoardDraft(value);receipt=null;applied=false;formDirty=false;message=notice;
  $('#workflow-draft-status').textContent='Draft updated · not applied';
  syncControls();renderProposal();
}
function views(b){
  if(b.workflow==='writing') return `<section class="wf-view-card"><b>Writing</b><div class="wf-tiles"><span>Paper source<br><small>LaTeX editor</small></span><span>Compiled PDF<br><small>Build & review</small></span></div></section><div class="wf-view-pills"><span>Brief</span><span>Notes</span></div>`;
  if(b.workflow==='software') return `<section class="wf-view-card"><b>Code editor</b><div class="wf-tiles"><span>Project files<br><small>VS Code & extensions</small></span></div></section><div class="wf-view-pills"><span>App preview</span><span>Review</span><span>Notes</span></div>`;
  return `<section class="wf-view-card"><b>Results <small>${b.metrics.length} measured objectives</small></b><div class="wf-tiles">${b.metrics.map(key=>`<span>${metrics[key]}<small>E18 / E12</small></span>`).join('')}</div></section><div class="wf-view-pills"><span>Code</span><span>Runs & compute</span><span>Project files</span></div>`;
}
const linkedTargets=()=>['current','linked'].filter(id=>preview.state.targets[id].libraryId===chosen);
function renderProposal(){
  const b=preview.state.draft,p=presets[b.workflow],entry=library.find(e=>e.id===chosen);
  $('.wf-proposal').innerHTML=`
    <div class="wf-proposal-header"><b>Proposed workflow</b><span class="wf-draft-badge">${applied?'Applied locally':'Draft'}</span></div>
    <div class="wf-notice" role="status" ${message?'':'hidden'}>${esc(message)}</div>
    <div class="wf-library"><label>Saved Surfboard<select id="workflow-library">${library.map(e=>`<option value="${e.id}" ${e.id===chosen?'selected':''}>${esc(e.name)} · v${e.versions.length}</option>`).join('')}</select></label><div class="wf-version-row"><select id="workflow-version" aria-label="Surfboard version">${entry.versions.map((v,i)=>`<option value="${i+1}" ${i+1===version?'selected':''}>Version ${i+1}</option>`).reverse().join('')}</select><button data-workflow-action="load">Preview saved</button></div></div>
    <details class="wf-outline" open><summary>Views &amp; workflow <span>${esc(p.name)}</span></summary><div class="wf-view-preview">${views(b)}</div><div class="wf-schematic"><div><b>${p.lead}</b><i>hands off →</i><b>${p.worker}</b></div>${p.steps.map(([a,relation,z])=>`<div><span>${a}</span><i>${relation} →</i><span>${z}</span></div>`).join('')}</div></details>
    <details class="wf-agent-outline"><summary>Agents, requirements &amp; when you’re away</summary><p><b>${p.worker} · ${b.provider}</b><br>${esc(b.workerInstruction)}</p>${b.workflow==='research'?`<p>${[['authorization','User authorization'],['commit','Exact commit'],['pr','Verified PR'],['mfu','Numeric MFU guidance']].filter(([key])=>b.requirements[key]).map(([,label])=>esc(label)).join(' · ')}.</p><p>Check-in interval: ${b.interval} minutes. Monitoring requires an explicit scope and stopping condition.</p><p class="wf-guidance">${esc(b.guidance)}</p>`:''}<p>Applying configures the workspace. It starts no jobs or recurring work.</p></details>
    <div class="wf-save"><label>Surfboard name<input id="workflow-name" maxlength="160" value="${esc(name)}"></label><div><button data-workflow-action="save">Save as new</button><button data-workflow-action="version">Save new version</button></div></div>
    <label class="wf-scope">Apply changes to<select id="workflow-scope"><option value="current" ${scope==='current'?'selected':''}>This task</option><option value="future" ${scope==='future'?'selected':''}>Future tasks in this project</option><option value="existing" ${scope==='existing'?'selected':''}>Selected linked tasks</option></select></label>
    <div class="wf-targets" ${scope==='existing'?'':'hidden'}>${linkedTargets().map(id=>`<label><input type="checkbox" data-workflow-target="${id}" ${selectedTasks.has(id)?'checked':''}>${preview.state.targets[id].name}${id==='linked'?'<small>Local setting: 15-minute check-ins at the start</small>':''}</label>`).join('')||'<p>No tasks use this saved Surfboard yet. Apply it to this task to link it.</p>'}<p>These are local example tasks, separate from my actual runs.</p></div>
    <button class="primary wf-review-button" data-workflow-action="review">Review &amp; use workflow →</button>
    <div id="workflow-review" aria-live="polite"></div>
    <div class="wf-history" ${preview.state.history.length?'':'hidden'}><span>${preview.state.history.length} applied ${preview.state.history.length===1?'update':'updates'}</span><button data-workflow-action="undo">Undo last batch</button></div>`;
  renderReview();
  markPendingControls();
}
const fieldLabels={workflow:'Workflow preset',provider:'Worker provider',workerInstruction:'Worker instruction',guidance:'Manager guidance',interval:'Check-in interval',metrics:'Results panels',gpuLimit:'Project GPU limit',runLimit:'Project run limit','requirements.authorization':'User authorization','requirements.commit':'Exact commit','requirements.pr':'Verified PR','requirements.mfu':'Numeric MFU guidance'};
const label=path=>fieldLabels[path]||path;
function format(value,path){
  if(typeof value==='boolean') return value?'Required':'Not required';
  if(path==='workflow') return presets[value]?.name||value;
  if(Array.isArray(value)) return value.map(v=>metrics[v]||v).join(', ');
  if(path==='interval') return value+' min';
  if(['gpuLimit','runLimit'].includes(path) && value===0) return 'Unlimited';
  return String(value??'None');
}
function renderReview(){
  const container=$('#workflow-review');if(!receipt){container.innerHTML='';return;}
  container.innerHTML=`<section class="wf-review-card" aria-label="Review workflow update"><h4>${applied?'Workflow applied':'Review exact changes'}</h4>${receipt.targets.map(t=>`<article><b>${esc(t.name)}</b>${t.changes.length?`<ul>${t.changes.map(d=>`<li><strong>${esc(label(d.path))}</strong><span class="wf-diff-before">${esc(format(d.before,d.path))}</span><span class="wf-diff-after">→ ${esc(format(d.after,d.path))}</span></li>`).join('')}</ul>`:`<p>${t.linkChange?'Link this task to the selected saved Surfboard.':'Already matches the proposal.'}</p>`}${t.preserved.map(d=>`<p class="wf-preserved">Kept local ${esc(label(d.path).toLowerCase())}: ${esc(format(d.after,d.path))}.</p>`).join('')}${t.conflicts.map(path=>`<p class="wf-conflict">Conflict: ${esc(label(path))} changed in both the task and this proposal. Keep its local value in the proposal or deselect this task, then review again.</p>`).join('')}</article>`).join('')}<p class="wf-review-note">${applied?'Applied only to these local copies.':'Review affects only these local copies.'} No jobs or monitoring are launched.</p>${applied?`<button class="quiet-button" data-workflow-action="open">${preview.state.targets.current.value.workflow==='writing'?'Open my recorded LaTeX workspace':preview.state.targets.current.value.workflow==='software'?'Open my actual source':'Open my measured plots'} ↗</button>`:`<button class="primary" data-workflow-action="apply" ${receipt.canApply?'':'disabled'}>Apply these changes</button>`}</section>`;
}
function updateWorkspace(){
  const current=preview.state.targets.current.value;
  document.dispatchEvent(new CustomEvent('preview:metrics',{detail:current.metrics}));
}
function invalidate(){receipt=null;applied=false;renderReview();}
root.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='workflow-library'){chosen=Number(el.value);version=library.find(e=>e.id===chosen).versions.length;invalidate();renderProposal();}
  if(el.id==='workflow-version'){version=Number(el.value);invalidate();}
  if(el.id==='workflow-scope'){scope=el.value;invalidate();renderProposal();}
  if(el.dataset.workflowTarget){el.checked?selectedTasks.add(el.dataset.workflowTarget):selectedTasks.delete(el.dataset.workflowTarget);invalidate();}
});
function markPendingControls(){
  for(const action of ['review','save','version','apply']){const button=root.querySelector(`[data-workflow-action="${action}"]`);if(button && formDirty)button.disabled=true;}
}
root.addEventListener('input',event=>{
  if(event.target.id==='workflow-name')name=event.target.value;
  if(event.target.closest('#workflow-form')){formDirty=true;$('#workflow-draft-status').textContent='Update the proposal to include these edits.';markPendingControls();}
});
$('#workflow-form').addEventListener('submit',event=>{
  event.preventDefault();
  const selected=[...document.querySelectorAll('[name="metric"]:checked')].map(el=>el.value);
  if(!selected.length){$('#workflow-draft-status').textContent='Keep at least one objective visible.';return;}
  const draft=copy(preview.state.draft);
  draft.provider=$('#workflow-provider').value;draft.interval=Number($('#workflow-interval').value);
  draft.metrics=selected;
  if(draft.requirements.mfu!==$('#workflow-mfu').checked)draft.guidance=$('#workflow-mfu').checked?recordedGuidance:'';
  draft.requirements.mfu=$('#workflow-mfu').checked;draft.workerInstruction=$('#workflow-instruction').value.trim();
  stage(draft);
});
root.addEventListener('click',event=>{
  const preset=event.target.closest('[data-preset]');
  if(preset){const key=preset.dataset.preset;stage({...copy(preview.state.draft),workflow:key,workerInstruction:presets[key].instruction},`${presets[key].name} preset staged. Review before applying.`);return;}
  const action=event.target.closest('[data-workflow-action]')?.dataset.workflowAction;
  if(!action)return;
  try{
    if(action==='advanced'){$('#advanced-board').open=true;$('#advanced-board').scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(action==='save'||action==='version'){
      const cleanName=name.trim();if(!cleanName||/[\x00-\x1f\x7f]/.test(cleanName))throw Error('Give the Surfboard a name before saving.');
      if(action==='save'){chosen=Math.max(...library.map(e=>e.id))+1;library.push({id:chosen,name:cleanName,versions:[reusableWorkflow(preview.state.draft)]});version=1;}
      else{const entry=library.find(e=>e.id===chosen);entry.name=cleanName;entry.versions.push(reusableWorkflow(preview.state.draft));version=entry.versions.length;}
      message=`Saved version ${version} for this visit. Project GPU and run limits stay with the project.`;invalidate();renderProposal();return;
    }
    if(action==='load'){
      const saved=library.find(e=>e.id===chosen);name=saved.name;
      stage({...copy(preview.state.draft),...copy(saved.versions[version-1])},`Version ${version} staged. Project compute limits are preserved.`);return;
    }
    if(action==='review'){
      const ids=scope==='existing'?linkedTargets().filter(id=>selectedTasks.has(id)):[scope==='future'?'future':'current'];
      receipt=preview.preview(ids,chosen);applied=false;message='';renderProposal();
      $('#workflow-review').scrollIntoView({behavior:'smooth',block:'nearest'});return;
    }
    if(action==='apply'){
      preview.apply(receipt);applied=true;message='Workflow applied to the selected local copies. You can undo this batch.';updateWorkspace();renderProposal();return;
    }
    if(action==='undo'){
      preview.undo();receipt=null;applied=false;message='Previous configuration restored. The proposal is still available to edit.';updateWorkspace();renderProposal();return;
    }
    if(action==='open'){
      const kind=preview.state.targets.current.value.workflow;
      document.querySelector(`.workspace-tabs [data-view="${kind==='writing'?'latex':kind==='software'?'code':'results'}"]`).click();
      $('#experiment').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }catch(error){message=error.message;renderProposal();}
});
document.addEventListener('preview:board-draft',event=>stage(event.detail));
document.addEventListener('preview:advanced',()=>{
  if(preview.state.draft.workflow!=='research') stage({...copy(preview.state.draft),workflow:'research',workerInstruction:presets.research.instruction},'Research draft opened in the advanced graph.');
});
syncControls();renderProposal();

// The plots finish loading before this module; align a direct Surfboards link after layout.
if(location.hash==='#surfboards')requestAnimationFrame(()=>$('#surfboards').scrollIntoView({behavior:'instant',block:'start'}));
