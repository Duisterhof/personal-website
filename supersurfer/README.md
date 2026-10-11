# Super Surfer — interactive demo

Live page: https://bardienus.com/supersurfer/

The website deploys through its existing Netlify integration from `master`.
Serve the repository root locally and open `/supersurfer/`.

## Page

`index.html`, `concept.css`, and `concept.js` contain the published demo. The
opening names the problems: repeated agent instructions, disconnected tools,
and manual GPU coordination. The walkthrough follows one experiment idea through
a saved Surfboard: Implement → PR → Launch checks → Launch → Monitor / visualize.
Permissions, workflow requirements, and compute limits are configured beforehand.

The sticky workflow follows the scroll position. Custom analysis has an interactive
scatter plot with selectable DINO, depth, and track objectives, and measured-point
inspection. Code, LaTeX, and agent chat tabs show real source and original app
captures. Surfboard, compute, and workspace captures open at full size.

The example idea and workflow/queue sequences are labeled storyboards. This is
not a recording of one continuous experiment. No agents, jobs, or builds are run.

## Evidence

`assets/source/orthogonal_codec.py` is an exact copy from
`/data4/home/bart/src/vla-simple/.worktrees/e12-orthonormal-codec` on tulip,
revision `111c287c4dd2f4ccf75f5201069226158a90e4b7`, branch
`e18/sr400-orthogonal-20261008`. This is the observed research worktree revision,
not an assertion of the training run's exact launch revision. The demo shows
lines 30–48 as a real code example.

`experiment-data.json` contains selected numeric E18 and E12 training histories
read through the workspace's W&B integration on October 9, 2026. The 3,090 bundled
source rows retain their source identities, timestamps, x keys, and offsets.
The scatter plot uses 1,823 paired observations in the joint-update window
1,000–84,850. No generated observations or synthetic evaluation scores are used.

E12's joint-codec phase follows 89,738 frozen-PCA predictor updates; E18 starts
fresh. Equal joint-phase updates do not mean equal total training exposure.
These are training objectives, not task-success evaluations.

Captures in `assets/recorded/` show the actual Super Surfer app on October 9,
2026, including the VS Code backend, extensions, LaTeX/PDF, GPU jobs, and Surfboard
requirements. These captures and research examples were approved for publication
on October 9. No new internal queue metadata is included.

## Validation

- Check script syntax with `node --check supersurfer/concept.js`.
- Check desktop and mobile layout, workflow navigation, analysis metric selection,
  code and capture tabs, and capture dialogs in the browser.
- Verify page dependencies exist and load from the same origin.

The original demo's assets and scripts remain in the repository for reference;
they are not loaded by the current landing page.
