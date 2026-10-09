# SuperSurfer product walkthrough

Published at https://bardienus.com/supersurfer/ through the existing Netlify site.
This is a static site: serve the repository root and open `/supersurfer/`.

The primary demo reenacts four workflows observed in the tulip workspace's
Supersurfer conversations, experiment records, and saved surfboards on 2026-10-09:

- Compare E18 with E12, use logarithmic loss axes and a matched step window,
  and bring task-weighted evaluation and protocol context into Results.
- Inspect E15/E16 MFU, throughput and memory, then review a microbatch 64
  continuation plan without conflating throughput with scientific improvement.
- Inspect agent edits in the code editor and accept or reject a sample patch.
- Reformat a workshop schedule beside LaTeX source; create Website design
  as a separate task and checklist within the proposal project.

Requests are shortened reenactments, not verbatim transcripts. All charts,
metrics, code snippets, schedules and compute allocations are illustrative.
Private logs, host addresses, credentials, actual run records, source revisions,
unpublished results and proposal text are not bundled or fetched by the demo.
Success rates are independent evaluation examples, never derived from loss.

`experiment-demo.js` implements the four stateful browser walkthroughs.
`surfboard-demo.js` implements a draft/apply configuration preview: role/model,
reasoning, input scope, result panels, review interval and stop condition.
Applying a surfboard never starts an agent, timer or job. These previews reset
on reload; the full playground retains its existing browser-local persistence.

The remaining sections demonstrate panel docking and the full writing,
research and coding playground. The writing example is not a LaTeX compiler.
The existing editable playground, PDF viewer, file imports and layout controls
remain available. No interaction publishes code, calls a model or submits a job.
