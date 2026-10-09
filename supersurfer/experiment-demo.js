/* Public, deterministic reenactments of workflow requests. No private data or live agents. */
const root = document.querySelector('#experiment-demo');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scenarios = {
  compare: {label:'Compare experiments', short:'E18 · Codec study', group:'VLA research', title:'E18 / Compare with E12', agent:'Experiment worker', context:'E18 · Results',
    intro:'E12 and E18 are open together. Change the axes, add evaluation evidence, or ask for a different view.',
    prompts:[['axes','Make the y-axis log scale and match the step range.'],['success','Add success rates beside the training curves.'],['context','Show the protocol for this comparison.']]},
  efficiency: {label:'Improve GPU efficiency', short:'E15 + E16 · Efficiency', group:'VLA research', title:'E15 + E16 / Training efficiency', agent:'Research lead', context:'VLA · Efficiency',
    intro:'Two existing experiments, one performance question. Put utilization and memory beside the learning curves before changing the batch size.',
    prompts:[['telemetry','Show MFU, throughput, and GPU memory.'],['migration','Compare the microbatch 64 continuation plan.'],['compute','Show where the jobs are running.']]},
  coding: {label:'Review code', short:'Code review', group:'VLA research', title:'Code review / Inspect the agent’s changes', agent:'Code review worker', context:'VLA · Code review',
    intro:'Bring the proposed change into the editor. Inspect the diff, then decide which edits belong in your working file.',
    prompts:[['diff','Show me the diff in the code editor.'],['accept','Accept this patch.'],['reject','Reject this patch.']]},
  writing: {label:'Write the proposal', short:'Proposal writing', group:'ICLR proposal', title:'Proposal / Source, document, and a second task', agent:'Writing collaborator', context:'ICLR proposal · Writing',
    intro:'Keep the LaTeX source and document together. Give website work its own task and checklist within the same project.',
    prompts:[['schedule','Reformat the workshop schedule.'],['website','Create a separate website design task and to-dos.'],['paper','Give the document more room.']]}
};
const blank = () => ({axes:false,success:false,context:false,telemetry:false,migration:false,diff:true,patch:'pending',schedule:false,website:false,paper:false,view:'work',history:[]});
const states = Object.fromEntries(Object.keys(scenarios).map(id => [id,blank()]));
let active = 'compare', panel = 'work';
const selected = () => states[active];
function actionButton(id,label,attrs='') { return `<button type="button" data-demo-action="${id}" ${attrs}>${label}</button>`; }
function chart({log=false,matched=false,small=false,labels=['E12','E18']}={}) {
  const width=600,height=small?175:245,left=48,right=578,top=24,bottom=height-35,maxStep=matched?70:120;
  const y = v => bottom-(log?(Math.log10(v)+1.3)/1.7:v/2.5)*(bottom-top);
  const grid=(log?[.05,.2,1,2.5]:[0,1,2]).map(v=>`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left-9}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('');
  const lines=[0,1,2,3].map(i=>{const end=i<2?maxStep:70;const points=Array.from({length:61},(_,j)=>{const step=end*j/60,value=2.2*Math.exp(-step/(i<2?19:23))+.12+(i%2?.075:0)+Math.sin(j*.55+i)*.018;return `${left+(right-left)*step/maxStep},${y(value)}`}).join(' ');return `<polyline points="${points}" stroke="${i<2?'#1473b6':'#a36935'}" ${i%2?'stroke-dasharray="5 4"':''}/>`;}).join('');
  return `<svg class="research-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Illustrative ${labels[0]} and ${labels[1]} loss curves, ${log?'logarithmic':'linear'} loss axis, 0 to ${maxStep} thousand steps"><g class="chart-grid">${grid}</g><g class="chart-series">${lines}</g><g class="chart-labels"><text x="${left}" y="13">${log?'Log loss':'Loss'}</text>${[0,.25,.5,.75,1].map(p=>`<text x="${left+(right-left)*p}" y="${bottom+18}" text-anchor="middle">${Math.round(maxStep*p)}k</text>`).join('')}<text x="310" y="${height-1}" text-anchor="middle">Training step</text></g></svg>`;
}
function header(title,note,extra='') {return `<header class="tile-heading"><strong>${title}</strong><span>${note}</span>${extra}</header>`;}
function compareView(s) {
  return `<div class="demo-view-grid ${s.success?'with-eval':''}"><article class="demo-tile curve-tile">${header('Training & validation',s.axes?'Log scale · matched 0–70k':'Linear scale · full history')}
    <div class="chart-body"><div class="chart-legend"><span class="method-blue">● E12 · PCA-packed</span><span class="method-amber">● E18 · Learned basis</span><span>━ train &nbsp; ┄ validation</span></div>${chart({log:s.axes,matched:s.axes})}
    <div class="chart-options">${actionButton('axes',s.axes?'✓ Log scale + matched steps':'Use log scale + matched steps',`aria-pressed="${s.axes}"`)}<small>Illustrative curves</small></div></div></article>
    ${s.success?`<article class="demo-tile evidence-tile">${header('Evaluation','Added to this page')}<div class="evidence-body"><span class="demo-kicker">Task-weighted success rate</span><strong class="sample-metric">72.5<span>%</span></strong><p>Sample evaluation · 8 tasks · 400 episodes</p><div class="sample-bars">${[82,65,88,42,76,90,66,71].map((v,i)=>`<div title="Sample task ${i+1}: ${v}%"><i style="height:${v}%"></i><span>${i+1}</span></div>`).join('')}</div><p class="tile-note">Example values only. Evaluation stays separate from training loss.</p></div></article>`:''}
    ${s.context?`<article class="demo-tile protocol-tile">${header('Protocol & provenance','New context view')}<div class="protocol-grid"><div><b>Question</b><p>Compare a learned, PCA-initialized orthonormal basis with the E12 packing baseline.</p></div><div><b>Keep comparable</b><p>Recorded source, data split, normalization, loss definitions, and evaluation protocol.</p></div><div><b>Read the evidence</b><p>Training loss, validation, and robot success each answer a different question.</p></div></div></article>`:''}
    ${!s.success&&!s.context?`<div class="add-view-cue"><span>＋</span><div><b>Your next question becomes a view.</b><p>Try “Add success rates” in the conversation.</p></div>${actionButton('success','Add evaluation view ↗')}</div>`:''}</div>`;
}
function efficiencyView(s) {
  return `<div class="demo-view-grid"><article class="demo-tile">${header('E15 + E16','Existing experiment lineages')}<div class="chart-body"><div class="chart-legend"><span class="method-blue">● E15</span><span class="method-amber">● E16</span><span>Illustrative learning curves</span></div>${chart({small:true,matched:true,labels:['E15','E16']})}</div></article>
    ${s.telemetry?`<article class="demo-tile">${header('Training efficiency','Added beside the curves')}<div class="telemetry-grid"><div><span>MFU</span><b>5.0<small>%</small></b><em>Investigate compute utilization</em></div><div><span>Throughput</span><b>128<small>/s</small></b><em>Examples per second</em></div><div><span>GPU memory</span><b>28<small> / 40 GiB</small></b><em>Sample device</em></div></div><p class="tile-note padded">Illustrative telemetry, not measured performance or a claimed improvement.</p></article>`:`<div class="add-view-cue"><span>↗</span><div><b>Loss is only part of the picture.</b><p>Bring hardware efficiency into the same workspace.</p></div>${actionButton('telemetry','Add telemetry ↗')}</div>`}
    ${s.migration?`<article class="demo-tile">${header('Microbatch 64','Continuation plan · review before execution')}<div class="migration"><div><span>Change</span><b>Physical batch grouping → 64</b></div><div><span>Preserve</span><b>Weights · optimizer · sampling · exposure</b></div><div><span>Verify</span><b>Checkpoint migration + numerical differences</b></div><div><span>Then inspect</span><b>Actual progress · MFU · memory</b></div></div><p class="tile-note padded">The plan changes in this demo. No training process is modified.</p></article>`:''}</div>`;
}
function codingView(s) {
  const accepted=s.patch==='accepted';
  return `<article class="demo-tile code-tile">${header('train.py',`Illustrative patch · ${s.patch}`, '<a href="playground.html?workflow=coding" target="_blank" rel="noopener">Open editable workspace ↗</a>')}
    <div class="code-caption">Keep validation on the same step axis as training.</div><pre class="demo-code"><span class="code-muted"> 1</span>  <span class="code-purple">def</span> log_metrics(step, train_loss, val_loss):
<span class="code-muted"> 2</span>      <span class="code-muted"># Publish the evidence for this step.</span>
${s.patch==='pending'&&s.diff?'<span class="code-remove">−     wandb.log({"train/loss": train_loss}, step=step)</span>':''}${accepted||s.patch==='pending'&&s.diff?'<span class="code-add">+     metrics = {</span><span class="code-add">+         "train/loss": train_loss,</span><span class="code-add">+         "val/loss": val_loss,</span><span class="code-add">+     }</span><span class="code-add">+     wandb.log(metrics, step=step)</span>':' 3      wandb.log({"train/loss": train_loss}, step=step)'}</pre>
    <div class="patch-actions">${s.patch==='pending'?`${actionButton('accept','Accept patch', 'class="solid-button"')}${actionButton('reject','Reject patch')}`:`<span class="patch-receipt">${accepted?'✓ Patch accepted in the demo':'Original code retained'}</span>${actionButton('diff','Review again')}`}<span>Browser-only example</span></div></article>`;
}
function writingView(s) {
  return `<div class="writing-grid ${s.paper?'paper-wide':''}"><article class="demo-tile source-tile">${header('main.tex','LaTeX source')}<pre class="demo-code"><span class="code-purple">\\section</span>{Workshop program}

${s.schedule?'<span class="code-add">\\begin{tabular}{ll}</span><span class="code-add">09:00 &amp; Opening \\\\</span><span class="code-add">09:15 &amp; Invited talks \\\\</span><span class="code-add">10:30 &amp; Discussion \\\\</span><span class="code-add">\\end{tabular}</span>':'Opening at 09:00, followed by\ninvited talks at 09:15 and\ndiscussion at 10:30.'}

<span class="code-purple">\\section</span>{Discussion}
World models that can act
within a robot’s deadline.</pre></article><article class="demo-tile paper-tile">${header('proposal.pdf','Document preview')}<div class="proposal-sheet"><span>WORKSHOP PROPOSAL · DEMO EXCERPT</span><h3>Real-Time World Models<br>for Robotics</h3><h4>Workshop program</h4>${s.schedule?'<dl class="schedule"><dt>09:00</dt><dd>Opening</dd><dt>09:15</dt><dd>Invited talks</dd><dt>10:30</dt><dd>Discussion</dd></dl>':'<p>Opening at 09:00, followed by invited talks at 09:15 and discussion at 10:30.</p>'}<h4>Discussion</h4><p>How do we connect video world models with decisions that must arrive on time?</p></div></article>
    ${s.website?`<article class="demo-tile website-tile">${header('Website design','Separate task · same project')}<div class="todo-list"><label><input type="checkbox"> Connect the workshop repository</label><label><input type="checkbox"> Prepare the program page</label><label><input type="checkbox"> Review speaker links and submission details</label></div><p class="tile-note padded">The proposal writer keeps its own conversation and source.</p></article>`:''}</div><p class="tile-note padded">Scripted source and document preview. Try the full workspace to edit text and attach selections.</p>`;
}
function computeView() {
  return `<article class="demo-tile">${header('Shared compute','Illustrative allocation')}<div class="compute-rows">${[['Tulip','Evaluation','2 GPUs','Prepared'],['Trinity','E15 + E16 training','Shared GPU pool','Running'],['PSC / Slurm','Cluster onboarding','Queued batch job','Setup']].map(([name,work,count,status])=>`<div><span class="host-icon">▦</span><div><b>${name}</b><small>${work}</small></div><span>${count}</span><em>${status}</em></div>`).join('')}</div><div class="compute-context"><b>The manager handles shared resources.</b><p>Experiment workers keep their own code, protocol, results, and conversation. Switching projects does not stop remote work.</p></div></article>`;
}
function render() {
  const scene=scenarios[active],s=selected();
  root.innerHTML=`<div class="demo-scenarios" role="group" aria-label="Try a real workflow">${Object.entries(scenarios).map(([id,d],i)=>`<button data-scenario="${id}" aria-pressed="${id===active}"><span>0${i+1}</span>${d.label}</button>`).join('')}</div>
    <div class="lab-titlebar"><span class="traffic"><i></i><i></i><i></i></span><b>SuperSurfer</b><span class="workspace-connection"><i></i> tulip workspace</span><span class="demo-label">Interactive reenactment</span>${actionButton('reset','↺ Reset','aria-label="Reset this walkthrough"')}</div>
    <div class="research-shell"><aside class="research-sidebar"><span class="sidebar-eyebrow">PROJECTS</span><b class="project-label">⌄ &nbsp; VLA research</b>${Object.entries(scenarios).filter(([id])=>id!=='writing').map(([id,d])=>`<button data-scenario="${id}" class="${id===active?'selected':''}"><span>${id==='coding'?'◇':'◈'}</span>${d.short}</button>`).join('')}<b class="project-label">⌄ &nbsp; ICLR proposal</b><button data-scenario="writing" class="${active==='writing'?'selected':''}"><span>▤</span>Proposal writing</button>${states.writing.website?'<button data-scenario="writing"><span>◇</span>Website design</button>':''}<div class="sidebar-bottom"><span class="status-dot"></span> Remote work continues<br><small>Each task keeps its context.</small></div></aside>
    <div class="research-main"><div class="task-heading"><span>${scene.title}</span><a href="playground.html?workflow=${active==='compare'||active==='efficiency'?'research':active}" target="_blank" rel="noopener" aria-label="Open full ${scene.label.toLowerCase()} workspace">Open workspace ↗</a></div><nav class="research-tabs" aria-label="Demo task views"><button data-demo-panel="work" aria-pressed="${panel==='work'}">${active==='writing'?'Writing':active==='coding'?'Code':'Results'}</button><button data-demo-panel="compute" aria-pressed="${panel==='compute'}">Compute</button><a href="#surfboards">Customize surfboard ↗</a></nav><div class="demo-workarea">${panel==='compute'?computeView():active==='compare'?compareView(s):active==='efficiency'?efficiencyView(s):active==='coding'?codingView(s):writingView(s)}</div></div>
    <aside class="research-agent"><header><span class="agent-avatar">✧</span><div><b>${scene.agent}</b><small>${scene.context}</small></div></header><div class="demo-conversation"><p class="agent-intro">${scene.intro}</p>${s.history.map(h=>`<div class="demo-message user"><span>You</span><p>${escape(h.prompt)}</p></div><div class="demo-message reply"><span>✧ ${scene.agent}</span><p>${escape(h.reply)}</p></div>`).join('')}</div><div class="demo-prompt-list"><span>TRY A REQUEST FROM THE WORKFLOW</span>${scene.prompts.map(([id,label])=>actionButton(id,`<span>↗</span>${label}`,s.patch!=='pending'&&['accept','reject'].includes(id)?'disabled':'')).join('')}</div><form class="demo-composer"><label class="sr-only" for="demo-request">Ask to customize this view</label><input id="demo-request" placeholder="Try one of the requests above…" autocomplete="off"><button aria-label="Send demo request">↑</button></form><p class="demo-input-hint" role="status">Scripted requests · no live model</p></aside></div><div class="demo-statusbar"><span>Views, agents, and workflow rules are yours to change.</span><span>Sample metrics · browser only</span></div>`;
}
const replies={
  axes:'Changed the loss axis to log scale and clipped both methods to E18’s step range. Method colors and train/validation line styles stay consistent.',
  success:'Added an evaluation view beside the curves, with task-weighted success and a per-task breakdown. These demo values are separate from training loss.',
  context:'Added protocol and provenance below the comparison. The scientific context stays with the results.',
  telemetry:'Added MFU, throughput, and memory beside the learning curves. Now we can inspect whether training uses the hardware effectively.',
  migration:'Prepared the microbatch 64 continuation plan for E15 and E16: preserve training state, check numerical differences, then measure the actual effect.',
  compute:'Opened shared compute. Tulip, Trinity, and the Slurm cluster have different roles; the research conversations remain attached to their experiments.',
  diff:'Opened the proposed patch in the code view. Review the added validation metric before accepting it.',
  accept:'Accepted the sample patch. The working example now logs training and validation on the same step axis.',
  reject:'Rejected the sample patch. The original working example is retained.',
  schedule:'Reformatted the schedule into time and activity columns. Source and document update together in this scripted preview.',
  website:'Added Website design as a separate task under ICLR proposal, with its own checklist. Proposal writing stays selected.',
  paper:'Made more room for the document while keeping its source alongside it.'
};
function act(id, customPrompt) {
  const s=selected(),scene=scenarios[active];
  if(id==='reset'){states[active]=blank();panel='work';render();return;}
  if(!Object.hasOwn(replies,id))return;
  const prompt=customPrompt||scene.prompts.find(([action])=>action===id)?.[1]||({axes:'Use log scale and match the step range.',success:'Add an evaluation view.',telemetry:'Add training telemetry.',compute:'Show shared compute.',diff:'Show the proposed diff.',accept:'Accept this patch.',reject:'Reject this patch.'}[id]);
  if(['accept','reject'].includes(id)){if(s.patch!=='pending')return;s.patch=id==='accept'?'accepted':'rejected';}
  else if(id==='diff'){s.diff=true;s.patch='pending';}
  else s[id]=true;
  panel=id==='compute'?'compute':'work';
  s.history.push({prompt,reply:replies[id]});
  if(s.history.length>3)s.history.shift();
  render();
  const messages=root.querySelector('.demo-conversation');messages.scrollTop=messages.scrollHeight;
}
root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.scenario){active=button.dataset.scenario;panel='work';render();}
  else if(button.dataset.demoPanel){panel=button.dataset.demoPanel;render();}
  else if(button.dataset.demoAction)act(button.dataset.demoAction);
});
root.addEventListener('submit',event=>{
  event.preventDefault();const input=root.querySelector('#demo-request'),prompt=input.value.trim();if(!prompt)return;
  const rules={compare:[[/log|axis|axes|range/i,'axes'],[/success|eval/i,'success'],[/protocol|context|provenance/i,'context']],efficiency:[[/microbatch|batch|continu/i,'migration'],[/mfu|throughput|memory|telemetry/i,'telemetry']],coding:[[/reject/i,'reject'],[/accept/i,'accept'],[/diff|patch/i,'diff']],writing:[[/schedule|format/i,'schedule'],[/website|to.do|separate.*task/i,'website'],[/room|wider|document/i,'paper']]};
  const id=/compute|where.*(jobs|running)/i.test(prompt)?'compute':rules[active].find(([re])=>re.test(prompt))?.[1];
  if(id)act(id,prompt);else root.querySelector('.demo-input-hint').textContent='This preview understands the three suggested requests above. Try one to change the workspace.';
});
render();
