# Super Surfer — interactive demo

Live page: https://bardienus.com/supersurfer/
For local development, serve the repository root and open `/supersurfer/`.
The website deploys through its existing Netlify integration from `master`.

The page retains the approved Light Modern visual direction and original app
captures, and adds working local interactions around actual research evidence:

- Results: E18/E12 loss histories, logarithmic/linear scale, EMA with raw points
  retained, run filters, numeric windows, a last-20k shortcut, drag-to-zoom,
  expanded charts, pointer and keyboard inspection of nearest measured points.
- Code: editable Monaco models containing unchanged source snapshots from
  Bart's vla-simple codebase. The implementation and its tests have separate
  models. Selected lines attach to a local instruction draft with file, line,
  and revision context. Reset restores the original file. The actual VS Code
  backend and installed extensions remain available in original captures.
  This static demo's editor is Monaco; it does not start a VS Code backend or
  load the captured extensions. No draft is sent to an agent.
- Surfboard: a compact reconstruction of the recorded E19 workflow, embedded
  directly in the Surfboards section. Nodes can be selected, dragged, or moved
  with arrow keys. Reset layout preserves configured settings. The inspector
  changes agent provider/instructions, requirements, compute limits, monitor
  interval, and which objectives appear in Results. Settings last for this
  page session only. No agents, schedules, or queues are changed.
- Requirements: a local sample request checker evaluates authorization,
  exact 40-character commit, recorded PR verification, and finite numeric MFU
  with explicit percent/fraction units. A positive check does not authenticate
  any evidence or authorize a job. The fill-example MFU and verification flags
  are visibly labeled illustrative. MFU remains a manager instruction, not a
  native scheduler validation gate. Free-form guidance is not machine-validated.
- LaTeX/GPU views: authentic recorded app captures, with source/PDF and
  availability/run navigation. No build or job is triggered by this preview.

## Evidence

`assets/source/orthogonal_codec.py` and `test_orthogonal_codec.py` are exact
copies of `simple_vla/orthogonal_codec.py` and `tests/test_orthogonal_codec.py`
from `/data4/home/bart/src/vla-simple/.worktrees/e12-orthonormal-codec` on tulip,
revision `111c287c4dd2f4ccf75f5201069226158a90e4b7`, branch
`e18/sr400-orthogonal-20261008`. This is the observed E18 worktree revision;
it is not asserted to be the training run's exact launch revision.
The source snapshots are included as real research code examples.

`experiment-data.json` contains selected numeric E18 and E12 training histories
read through the workspace's W&B integration on October 9, 2026. Each source
retains its run ID, URL, observation timestamp, x key, and offset. Histories are
sampled with recent tail observations merged. The 3,090 bundled source rows
were checked against the fetched snapshot. No generated observations or
synthetic evaluation scores are used.

E12's joint-codec phase follows 89,738 frozen-PCA predictor updates; E18 starts
fresh. The visible window ends at E18's last snapshot update (84,850). Equal
joint-phase updates are not equal total training exposure. These are training
objectives, not task-success evaluations. EMA is calculated over the complete
recorded joint phase before the visible window is selected; raw values remain
available. Run filters affect displayed y limits.

Captures in `assets/recorded/` come from the running SuperSurfer app on October
9, 2026. They retain their original UI, including installed extensions,
compiled proposal, GPU allocation, running jobs, and Surfboard requirements.
These captures and research examples were approved for publication on October 9, 2026.

## Files and checks

- `workspace-demo.js`: original capture navigation and provider banner.
- `research-plots.js`: numeric history rendering and plot interaction.
- `interactive-workspace.js`: source editor, local draft, board, and inspector.
- `preview-rules.mjs`: pure local sample checks and range validation.
- `workspace-demo.css`, `interactive-workspace.css`: responsive layout.
- Existing Monaco bundle in `vendor/monaco/`, with its license notices.

No authentication material is bundled. Data and editor code load from the
same origin; the page makes no authenticated requests. Reduced motion
shows all agent providers statically. The static preview never executes Python.
