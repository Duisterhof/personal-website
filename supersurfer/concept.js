const $ = (s) => document.querySelector(s);
let activeTool='plot', data=null, source=null;
const toolNotes={plot:'Custom analysis: real E18/E12 training observations captured October 9. E12 was warm-started; equal joint-phase updates do not mean equal total training exposure. These are training objectives, not task-success scores.',code:'Exact source excerpt from the research worktree at revision 111c287. The linked screenshot shows the actual VS Code backend and its installed extensions; this preview is a source excerpt.',writing:'Actual LaTeX workspace captured October 9: source, built PDF, and original agent conversation. This demo displays the capture; it does not run a LaTeX build.',chat:'Focused crop of the original October 9 proposal-writing conversation. The complete app capture opens on click; no conversation has been invented.'};
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function keyboardTabs(selector,choose){
 const nodes=[...document.querySelectorAll(selector)];
 nodes.forEach((b,i)=>b.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%nodes.length;else if(e.key==='ArrowLeft')n=(i+nodes.length-1)%nodes.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=nodes.length-1;else return;e.preventDefault();choose(nodes[n]);nodes[n].focus();}));
}
const workflowSteps={
 implement:{title:'Implement',description:'The agent turns the experiment idea into code and tests, following the instructions in your saved Surfboard.'},
 pr:{title:'PR',description:'Agents prepare and review the pull request as your workflow specifies. The verified change and its exact revision are passed to the launch checks.'},
 checks:{title:'Launch checks',description:'The workflow verifies the PR and exact revision, then checks the request against your existing launch authorization. The run only advances when these requirements are satisfied.'}
};
let activeStep='';
function highlightStep(step){
 if(activeStep===step)return;
 activeStep=step;
 document.querySelectorAll('.flow-link').forEach(link=>{if(link.dataset.step===step)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
 document.querySelectorAll('[data-prep]').forEach(row=>row.classList.toggle('is-current',row.dataset.prep===step));
 if(workflowSteps[step]){const detail=workflowSteps[step];$('#workflow-detail').innerHTML='<b>'+escape(detail.title)+'</b><p>'+escape(detail.description)+'</p>';}
}
document.querySelectorAll('.flow-link').forEach(link=>link.addEventListener('click',()=>{
 const step=link.dataset.step;
 highlightStep(step);
}));
let scheduled=false;
function followScroll(){
 scheduled=false;
 $('.site-header').classList.toggle('is-scrolled',window.scrollY>30);
 const focusLine=$('.workflow-spine').getBoundingClientRect().bottom+80;
 let visible='prepare';
 document.querySelectorAll('[data-journey]').forEach(section=>{if(section.getBoundingClientRect().top<=focusLine)visible=section.dataset.journey;});
 if(visible==='prepare'){
  let preparationStep='implement';
  document.querySelectorAll('[data-prep]').forEach(row=>{if(row.getBoundingClientRect().top<=focusLine)preparationStep=row.dataset.prep;});
  highlightStep(preparationStep);
 }else highlightStep(visible);
}
function scheduleFollow(){if(!scheduled){scheduled=true;requestAnimationFrame(followScroll);}}
window.addEventListener('scroll',scheduleFollow,{passive:true});
window.addEventListener('resize',scheduleFollow);
window.addEventListener('load',scheduleFollow);
highlightStep('implement');

function capture(name,title){$('#capture-title').textContent=title;$('#capture-image').src='assets/recorded/'+name;$('#capture-image').alt=title;$('#capture-dialog').showModal();}
$('#close-capture').addEventListener('click',()=>$('#capture-dialog').close());
$('#capture-dialog').addEventListener('click',e=>{if(e.target===$('#capture-dialog'))$('#capture-dialog').close();});
$('#open-surfboard').addEventListener('click',()=>capture('surfboard-requirements.jpg','Actual research Surfboard · October 9 capture · scroll to inspect at full size'));
$('#open-compute').addEventListener('click',()=>capture('runs.jpg','Actual GPU runs and project allocation · October 9 capture'));

function tool(name){
 activeTool=name;
 $('#analysis-note').textContent=toolNotes[name];
 document.querySelectorAll('[data-tool]').forEach(b=>{const active=b.dataset.tool===name;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
 $('#tool-display').setAttribute('aria-labelledby','tool-'+name);
 if(name==='plot'){
  $('#tool-display').innerHTML='<div class="plot-heading"><div><h3>How do the objectives relate?</h3><p>A custom analysis tool built around your research question</p></div><select id="metric" aria-label="Visual objective"><option value="dino">DINO objective</option><option value="depth">Depth objective</option><option value="tracks">Track objective</option></select></div><div class="chart"><svg id="loss-chart" viewBox="0 0 680 270" role="img" aria-label="Logarithmic scatter plot of real paired action and visual training objectives"></svg></div><div class="legend"><span>E18 · fresh basis</span><span>E12 · warm-started</span></div><p class="chart-readout" id="chart-readout" role="status">Loading recorded observations…</p><div class="view-caption"><b>Your question. Your analysis tool.</b> Explore paired objectives from your experiment histories, then adapt the view to what you want to investigate.</div>';
  $('#metric').addEventListener('change',plot);plot();
 }else if(name==='code'){
  $('#tool-display').innerHTML='<div class="code-toolbar"><span>orthogonal_codec.py</span><span>vla-simple · 111c287</span></div><pre class="code-sample" aria-label="Actual orthogonal codec source"><code id="source-code"></code></pre><div class="view-caption"><b>Your code. Your extensions.</b> Real source from the research worktree.<br><button class="secondary-action" id="show-extensions">See the actual VS Code backend & extensions ↗</button></div>';
  paintSource();$('#show-extensions').addEventListener('click',()=>capture('vscode-extensions.jpg','Actual VS Code backend with Python, Vim, and other installed extensions · October 9'));
 }else if(name==='writing'){
  $('#tool-display').innerHTML='<button class="capture-button writing-capture" id="show-writing" aria-label="Enlarge actual LaTeX workspace"><img src="assets/recorded/latex-workspace.jpg" alt="Actual ICLR proposal source beside its compiled PDF and agent conversation"><span class="image-hint">Enlarge capture ↗</span></button><div class="view-caption"><b>Write, build, inspect.</b> Your real ICLR proposal: LaTeX source, compiled PDF, and the agent together.</div>';
  $('#show-writing').addEventListener('click',()=>capture('latex-workspace.jpg','Actual LaTeX source and built ICLR proposal PDF · October 9'));
 }else{
  $('#tool-display').innerHTML='<div class="chat-surround"><button class="capture-button chat-capture" id="show-chat" aria-label="Enlarge actual agent conversation"><img src="assets/recorded/latex-workspace.jpg" alt="Recorded proposal-writing conversation with the agent"><span class="image-hint">Original conversation ↗</span></button></div><div class="view-caption"><b>Sometimes, a conversation is enough.</b> A focused layout using the recorded proposal-writing chat.</div>';
  $('#show-chat').addEventListener('click',()=>capture('latex-workspace.jpg','Original proposal-writing conversation in its workspace · October 9'));
 }
}
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>tool(b.dataset.tool)));
keyboardTabs('[data-tool]',b=>tool(b.dataset.tool));
function paintSource(){if(!$('#source-code'))return;if(source===null){$('#source-code').textContent='Loading real source…';return;}$('#source-code').innerHTML=source.split('\n').slice(29,48).map((line,i)=>'<span class="ln">'+(i+30)+'</span>'+escape(line).replace(/\b(def|with|if|return|raise|not|or|as)\b/g,'<span class="kw">$1</span>')).join('\n');}

function plot(){
 if(activeTool!=='plot'||!data)return;
 const metric=$('#metric').value, names={dino:'DINO',depth:'Depth',tracks:'Tracks'};
 const points=data.sources.flatMap(s=>s.rows.filter(r=>r[0]-s.xOffset>=1000&&r[0]-s.xOffset<=84850).map(r=>({id:s.id,x:r[s.columns.indexOf('action')],y:r[s.columns.indexOf(metric)],step:r[0]-s.xOffset}))).filter(p=>p.x>0&&p.y>0&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 const bounds=(key)=>{const v=points.map(p=>Math.log10(p[key]));return [Math.floor(Math.min(...v)*2)/2,Math.ceil(Math.max(...v)*2)/2];};
 const [xmin,xmax]=bounds('x'),[ymin,ymax]=bounds('y');
 const X=v=>66+(Math.log10(v)-xmin)/(xmax-xmin)*592,Y=v=>223-(Math.log10(v)-ymin)/(ymax-ymin)*198;
 let markup='';
 for(let i=0;i<=4;i++){const x=66+i*148,y=223-i*49.5;markup+=`<path d="M${x} 25V223 M66 ${y}H658" stroke="#e0e7e1" stroke-width="1"/><text x="${x}" y="242" text-anchor="middle" fill="#67796f" font-size="10">${(10**(xmin+(xmax-xmin)*i/4)).toPrecision(2)}</text><text x="55" y="${y+3}" text-anchor="end" fill="#67796f" font-size="10">${(10**(ymin+(ymax-ymin)*i/4)).toPrecision(2)}</text>`;}
 markup+='<text x="360" y="263" text-anchor="middle" fill="#596970" font-size="10">Action objective · log scale</text><text x="67" y="14" fill="#596970" font-size="10">'+names[metric]+' objective · log scale</text>';
 points.forEach(p=>{p.px=X(p.x);p.py=Y(p.y);markup+=`<circle cx="${p.px.toFixed(2)}" cy="${p.py.toFixed(2)}" r="2" fill="${p.id==='e18'?'#6263d5':'#b77542'}" opacity=".42" aria-hidden="true"/>`;});
 markup+='<circle id="selected-point" r="5" fill="none" stroke="#162a34" stroke-width="1.5" visibility="hidden"/>';
 $('#loss-chart').innerHTML=markup;
 $('#chart-readout').textContent=points.length.toLocaleString()+' measured points · hover or tap to inspect · updates 1,000–84,850';
 function inspect(e){const rect=$('#loss-chart').getBoundingClientRect();const scale=Math.min(rect.width/680,rect.height/270),left=rect.left+(rect.width-680*scale)/2,top=rect.top+(rect.height-270*scale)/2;const x=(e.clientX-left)/scale,y=(e.clientY-top)/scale;const p=points.reduce((best,p)=>(p.px-x)**2+(p.py-y)**2<(best.px-x)**2+(best.py-y)**2?p:best);$('#selected-point').setAttribute('cx',p.px);$('#selected-point').setAttribute('cy',p.py);$('#selected-point').setAttribute('visibility','visible');$('#chart-readout').textContent=`${p.id==='e18'?'E18':'E12'} · joint update ${p.step.toLocaleString()} · action ${p.x.toPrecision(4)} · ${names[metric]} ${p.y.toPrecision(4)}`;}
 $('#loss-chart').onpointermove=inspect;$('#loss-chart').onclick=inspect;
}
tool('plot');scheduleFollow();
fetch('experiment-data.json').then(r=>{if(!r.ok)throw Error('history unavailable');return r.json();}).then(d=>{data=d;plot();}).catch(()=>{if($('#chart-readout'))$('#chart-readout').textContent='Recorded observations could not load. Reload the demo to try again.';});
fetch('assets/source/orthogonal_codec.py').then(r=>{if(!r.ok)throw Error('source unavailable');return r.text();}).then(s=>{source=s;paintSource();}).catch(()=>{source='Source snapshot could not load.';paintSource();});
