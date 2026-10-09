# SuperSurfer product walkthrough

The public website at https://bardienus.com/supersurfer/ is a scrollable walkthrough:
1. An interactive nested-layout animation introduces drag, split, resize and space.
2. An inspectable research surfboard explains roles, evidence gates and wakeups.
3. Writing, research and coding presets follow the workshop proposal, E15 projection/
   packing comparisons and training metric logger review used to develop the app.

Light Modern colors match the pinned VS Code theme. Editors use Monaco; embedded
PDFs use local PDF.js. The website never connects to production agents or compute.
Metrics, scripted conversations, GPU counts and runs are representative demo data.
LaTeX source preview is a demo renderer, not a remote compiler.

The full browser-local workspace is at playground.html?workflow=writing (or research,
coding). Root index.html is the scrollable story. The preview server on big-tulip
continues on port 8892; public hosting uses the existing personal-site Netlify deploy.

Validation: scroll height, animation controls, nested separator resizing, surfboard
rules, preset switching, four overlaid curves, queue interaction, actual Monaco patch
acceptance, writing source/title, mobile document width and no JS errors all pass.
Bundled assets retain upstream licenses in vendor/. Local source and layouts stay
in browser storage. Reset affects only the demo, never a production workspace.
