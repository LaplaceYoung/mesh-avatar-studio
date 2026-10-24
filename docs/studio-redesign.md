# Studio redesign — local-first avatar workbench

## Accepted scope

A complete replacement of the editor and Live UI, not a preview shell. Preserve
rig editing, history, file permissions, archive sharing, layer builds, variants,
Mandarin previews, camera/microphone tracking, lighting and OBS output. Light/dark
themes; 260 px parts, 340 px inspector, resizable 380 px agent dock. No upstream PR.

## Research (2026-10-24)

- Ant Design 6.6.7: https://ant.design/components/splitter/ and
  https://ant.design/docs/react/customize-theme/ — resizable/collapsible panels,
  tokens and theme algorithms. npm peer requirements include React 19.
- Ant Design X 2.9.0: https://x.ant.design/components/sender/ — composition-safe
  chat input, attachments/submit lifecycle, same design ecosystem as Ant Design.
- shadcn/ui: https://ui.shadcn.com/docs/components — strong alternative, including
  resizable panels and AI Elements; more component source/theme ownership for us.
- Arco: https://arco.design/react/components/overview — considered, but the Ant
  combination covers this editor and agent dock in a single token ecosystem.
- Claude: https://code.claude.com/docs/en/headless — SDK/stream JSON supports tools.
- Codex: https://developers.openai.com/codex/app-server/ — structured app protocol,
  threads, turns, events, approval requests.
- Pi: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md
  — subprocess RPC with events and commands.
- Terminal: https://xtermjs.org/docs/ — terminal rendering, resize and input APIs.

## Decisions

Ant Design owns buttons, fields, overlays, tabs, trees, split panels and theming.
Custom CSS describes the creative workbench layout, not replacement widgets.
Existing pure project/rig/media logic stays intact. No second state library or
router is needed to preserve the current local HTTP/OBS entry points.

The agent dock uses Ant X Sender plus xterm.js and node-pty. Each provider runs
its installed native interactive CLI, retaining its own tools, extensions,
login, model selection, permissions and session commands. This is a deliberate
native-session integration; it does not pretend terminal text is structured
chat/tool events. Structured SDK adapters can be added without replacing the dock.

Only explicit user Connect starts a process. Fixed provider allowlist, fixed
repository cwd, same-origin loopback HTTP/WebSocket checks, per-session bearer
capability, bounded replay buffer and process teardown. No arbitrary executable,
arguments, cwd, environment or permission-bypass flag from the browser. Secrets
remain with the local CLI; session outputs are not written to repository logs.
The CLI's permission policy remains authoritative; the bridge is not a sandbox.

## Completion checks

- All previous editing/project/media operations remain reachable.
- No legacy editor/live stylesheet or handwritten details/menu remains active.
- Light/dark theme, resize, narrow screen, overlays, keyboard and IME verified.
- Three native agent CLIs launch in the dock; terminal input, stop, reconnect and
  prompt composition work; startup is distinguished from verified model inference.
- Unit, type, lint, build, package and relevant browser regressions run.

## Current verification and remaining gates

The editor and Live now use the Ant Design workbench; the standalone Player's
visible controls also use the same theme/components. The editor's native canvas
interaction and media controllers are retained intentionally, not replaced with
mock behavior. The static marketing and embed pages have not been redesigned.
Legacy stylesheets remain in Git, but editor/Live/Player no longer import them.

Verified locally: TypeScript, lint, 232 unit tests, editor/site builds and all three
package builds. New browser coverage exercises project switching, numeric edits,
undo/redo, Mandarin mode, variant requests, theme switching, overlay dismissal,
Live controls, narrow viewport and cross-origin rejection. All three real local
CLIs launched through PTY and streamed output; no model inference or tool-write
success is claimed by that startup check.

The complete legacy browser suite still needs selector/interaction migration
from native details/select/range controls to the new accessible components. This
is not yet the final full-redesign acceptance. The existing Mandarin dictionary
and pronunciation approximations are also inherited, not certified by this UI
work.

Agent Connect runs the local CLI with its normal policy; native workspace trust
and tool permission prompts remain visible. The dock does not grant blanket
permissions. Sender submits to the native input, and the terminal remains usable
for slash commands and approvals. Disconnected sessions expire after five
minutes; reload persistence is not implemented yet. No session transcript is
written by the bridge.

Research access note: some documentation frontends returned HTTP 403; the Ant
Design Splitter/theme docs were retrieved from the official GitHub repository,
and Pi RPC docs from badlogic/pi-mono. npm metadata and installed CLI help were
also checked. Do not interpret this as every search provider becoming available.

## ACP migration — 2026-10-25 (supersedes terminal decisions above)

The user explicitly rejected TUI and E2E-based iteration. Active editor Agent
transport now uses the ACP SDK over stdio with pinned adapters for Claude,
Codex and Pi. `node-pty` and xterm dependencies were removed. No E2E or unit test
suite was run for this iteration: verification was TypeScript, lint, production
build, actual initialize/session-new on all three adapters, and an authenticated
HTTP/WebSocket/ACP bridge handshake with Codex. No inference/tool-execution
success is claimed by handshake evidence.

The Agent floats over the canvas, is initially minimized, can be dragged,
resized and expanded, and remains mounted when minimized. Chat text, tool status,
plans, permissions and cancellation are structured ACP events. Permission choices
are validated against the actual request and expire when a turn/session ends.
No client filesystem or terminal capability is advertised: the adapters use their
own native agent tools. The bridge is not a security sandbox for native tools.

Still pending: model/tool execution verification, richer tool results and diffs,
configuration/model selection, image upload and consent, staged automatic rig
creation, local crop/coordinate evidence, build/review correction loop and final
user-visible artifact acceptance. No claim of improved vision accuracy yet.

## Local illustration intake — 2026-10-25

The project library Create tab now accepts a PNG via upload/drop. The local-only
endpoint validates the PNG signature, dimensions (8192px edge / 16MP maximum),
CRC and complete decode before saving unchanged bytes beneath an exclusive UUID
in `projects/.uploads/`. File size is bounded to 24MiB. Paths are server-generated,
not filenames supplied by a browser. The endpoint does not contact a model.

The UI separately requires consent for the selected agent's configured vision
model (which may be remote). This does not authorize an image-generation service.
A consented task is prepared in the ACP composer for user submission. It specifies
source-coordinate crops, eye detail grids, calibration, overlays, layer checks,
pose review and bounded correction; no fake region coordinates/progress is shown.
The original is left in private uploads, and new-project writes a separate target.

A generated 64x96 transparent PNG was uploaded through the actual local endpoint:
201 response, correct dimensions/transparency, and SHA-256 equality of request and
stored bytes. This is intake evidence only, not model vision or avatar quality
validation. No E2E or unit suite was run. Full autonomous pipeline remains pending.

## Tool execution and regional evidence — 2026-10-25

A real Codex ACP prompt asked only to read root package.json. It emitted a file
read tool call, completed it, and returned the correct `mesh-avatar-studio` / `0.1.0`
with `end_turn`. No permissions were bypassed, no file was modified and no image
was sent. This proves one read-only tool cycle, not all providers or avatar creation.

The conversation now exposes expandable tool input/output and ACP file diffs,
rather than hiding everything behind a status title. Content is rendered as text,
not executed HTML; displayed detail is bounded to 64,000 characters per tool.

`uv run tools/vision-regions.py projects/<name> --regions projects/<name>/regions.json`
creates an immutable evidence folder with clean enlarged crops, source-coordinate
grids, a full-image region overview and a source-hashed transform manifest. The
explicit region JSON array has `name`, integer source `box: [x0,y0,x1,y1]`, grid
`step`, visual `observation` and self-reported `confidence: low|medium|high`.
All crops remain under that private project; the tool rejects out-of-image boxes
and redirected source/output paths. No inferred anatomy or automatic pass score
is fabricated. Grid transforms include both axis scales and label margins so
coordinates can be mapped back correctly. The upload task now requests this
packet before rig authoring.

Executed the tool on the previously generated private upload and visually opened
its grid output. This verifies artifact generation/coordinate labeling, not vision
accuracy on a real illustration. Semantic region accuracy and the full automated
build/review cycle still require real-image evidence. No E2E/unit suite was run.

## Artifact-linked progress — 2026-10-25

Consented creation tasks now register their intended private project name with a
production panel in the floating agent window. The panel polls a read-only local
inspection route every five seconds without overlapping requests. It distinguishes
missing, observed and invalid source/region/draft/rig/layer/review artifacts.
Rig validation uses the runtime validator; PNG header checks and metadata/file
presence are not presented as pixel decoding or visual quality approval. Review
artifacts older than source, rig or layer metadata are flagged for regeneration.

The generated-avatar action becomes available when source, valid rig and all
listed layer files are observed. It resolves the actual project list before
opening and prompts before replacing unsaved editor state. Visual review remains
explicitly unverified: an agent completion message cannot flip it to passed.

Actual local inspection: a nonexistent project reports all six stages missing
and preview unavailable. Existing miko-qipao-copy reports source, valid rig and
14 layer artifacts; regions/draft/review are missing and visual review remains
unverified. The project was read only. No E2E/unit suite was run.

Remaining: persistence/resumption of creation-task identity, source/rig/build
content hashes rather than timestamps for complete staleness detection, review
image inspector with explicit visual sign-off, and the real upload-to-build loop.

## Pose review and correction feedback — 2026-10-25

The production panel opens a dedicated review drawer with manifest-listed pose
images, zoom, explicit reload and per-project saved defect notes. Users select
an affected region and send a file-specific correction prompt to the ACP composer.
No visual approval is inferred from opening images or sending feedback. The review
image endpoint permits only PNG basenames listed in that private project's pose
manifest, validates real paths/signatures, and returns no-store/nosniff responses.
The latest creation-task identity survives refresh in browser preferences; restoring
it only resumes local artifact inspection, never model invocation or consent.

Executed the product's render-poses command on projects/miko-qipao-copy: generated
21 pose/sway frames, crops and contact sheet. Opened the contact sheet visually.
The local review route returned PNG bytes matching that exact file's SHA-256;
production state changed to review observed while visualReview stayed unverified.
This is rendering/serving evidence, not an E2E suite and not novel-image rig quality.

## Agent model configuration — 2026-10-25

The floating conversation now displays ACP-advertised session configuration,
including current model and reasoning effort where supported. Selection values
come from the adapter rather than a hardcoded model list. Both client and server
prevent configuration changes during active work. The server validates config IDs
and allowed values; only model/model_config/thought_level categories are editable.
Permission and collaboration modes remain read-only through this endpoint.
Failed changes preserve the last acknowledged configuration.

Actual adapter checks: Claude, Codex and Pi each returned current model/effort
configuration and acknowledged setting the model to its already selected value.
No alternate model, permission bypass or inference was invoked for this check.
This verifies configuration transport, not model vision accuracy. No E2E or unit
suite was run; TypeScript/lint/build were used for code validation.

## Mosi image generation

Mosi integration is server-only and reads `MOSS_API_KEY` from the local process
environment. Never paste the key into source, browser storage, prompts or a
commit. The endpoint calls `moss-image-sft-1.0` with `response_format: url`, then
downloads and validates the result before saving it privately under
`projects/.uploads/`. It rejects non-PNG output, bad signatures/CRC, oversized
images and dimensions outside the local processing limit. A Mosi URL is never
returned to the browser.

The fixed prompt is deliberately designed for tracing rather than generic image
quality: centered head-and-shoulders character, separate facial features, clear
hair locks/accessories, no face occlusion, clean silhouette and transparent or
flat background. A separate negative prompt rejects sheets, multiple poses,
backgrounds, text, merged silhouettes and covered eyes/mouth. This improves the
input conditions for later region evidence and rigging but does not guarantee
accurate segmentation.

## Generation input preservation and calibration evidence — 2026-10-25

Automatic connected-white removal is now opt-in, off by default. Every new Mosi
result retains its exact validated bytes as original.png; source.png contains
those same bytes unless removal was explicitly selected. The UI warns that
connected pale hair/clothing can be damaged. The heuristic is not semantic
segmentation and a nonempty alpha channel is not visual approval. Prompt now
requests a solid white background, no faux transparency checkerboard, clear
contours and top/side margins. No new paid generation was needed for this change.
Downloads are read with a byte cap; dimensions are checked before PNG decoding;
network calls have timeouts. Upload preview access now checks local origin and
realpath containment and limits file size.

The previously captured real ACP image-reading response for the random calibration
PNG was scored only after the model response had been saved: median 0.72 px,
maximum 1.33 px, PASS. The model used one image-view tool; no answer-key access
was requested. This proves point-reading performance for that calibration, not
anatomical region recognition or successful arbitrary-image rigging.
TypeScript, lint and build passed. No E2E/unit suite was run. The chunk-size
warning remains; the full autonomous avatar creation goal is not yet complete.

## Explicit visual signoff — 2026-10-25

The production inspector now keeps `visualReview` separate from artifact state.
A review manifest can be present and valid while the project remains unverified.
After opening the pose drawer and personally checking the images, the user may
explicitly approve visual review. The local signoff is bound to the review
manifest mtime; any later source, rig or layer change makes the signoff stale.
The UI never auto-approves from Agent output, file existence or render success.

This preserves the intended distinction between “the pipeline produced files”
and “a human inspected the motion”. No E2E or unit suite was run; TypeScript and
lint passed after the change.

## Creation handoff and source preflight — 2026-10-25

After a user confirms an uploaded or generated illustration, the Agent window
now starts the explicitly selected ACP provider automatically when no session is
active. The confirmed prompt remains in a one-shot pending queue and is sent only
after ACP reports `ready`; reconnects cannot silently duplicate it. The user can
still cancel the pending task, stop the session, and answer native permission
requests explicitly. This removes the unnecessary second Connect click without
granting a permission or selecting a provider on the user's behalf.

PNG intake and Mosi output now run the same source preflight. It computes alpha
coverage, a conservative estimated content box, edge-touch flags and border-color
uniformity. These are pixel geometry/background heuristics, not face or anatomy
recognition and not a quality score. They are shown before creation and included
in the ACP task context so the Agent can decide whether to inspect framing,
background and pale clothing before tracing regions. No source image is altered
by this check.

## Automation alignment correction

Per-region human detail/grid acknowledgements are optional review provenance.
They do not make otherwise valid region evidence invalid and do not gate agent
rigging. The previous mandatory-click policy conflicted with upload-to-avatar
 automation. Missing, stale, malformed and low-confidence evidence still needs
correction; final human visual approval remains separate and is never inferred
from artifact presence. A successful status response does not prove anatomy or
motion quality. The existing review controls and private records are preserved.

## Production refresh and live-state ownership

ACP production completion requests an artifact inspection, not an editor reload.
The explicit Refresh project action still uses the current unsaved-edit guard.
This avoids invoking a stale editor callback retained by the WebSocket effect.
Artifact inspection keeps the previous snapshot visible while fetching its
replacement, so review drawers do not lose their selection between requests.

Historical activity in local storage is informational only: it must never disable
Resume. The currently mounted ACP session and pending request own the busy flag.
An explicit process exit releases the production-turn flag; a socket disconnect
alone does not prove the agent process stopped. Cross-tab task locking and session
recovery after a full page reload are not yet guaranteed by this client-side flag.

## Eye ROI calibration evidence

After the skin-fill fix, the private `mosi-live2d-demo` was rebuilt and rendered
through 21 poses. A conservative 8 px reduction on the image-right eye ROI outer
edge removed the visible gray corner in the closed-eye crop while keeping the lash
line intact. The rig validator passed and no new pose tear was visible. The
project and generated review images remain ignored local evidence; they are not
committed. A small residual risk remains at the right outer eyelid boundary when
hair or shadow touches the eye ROI.

## ACP session recovery

The dock persists only the local ACP capability tuple needed to reattach an
existing session after a page refresh. It never persists a prompt or silently
replays a production turn. A successful `session/new`/attach restores the
conversation and permission boundary; an expired capability clears local state
and requires an explicit reconnect. Historical production activity remains
informational and never creates a busy lock by itself.

## Bounded ACP reconnect

While a production turn is active, a lost browser WebSocket now retries attachment
up to three times with increasing short delays. The retry only sends `attach` for
the existing capability; it never replays the production prompt. After the limit,
the dock asks the user to reconnect manually. A provider process exit or expired
capability remains terminal and clears the session rather than retrying forever.

## Production turn persistence

The dock persists a minimal production-turn marker containing only the ACP session
id and project name. On reload it restores the busy guard and reattaches the
existing session without replaying the prompt. Completion, provider exit, session
expiry, and explicit stop clear the marker. A historical activity record alone
never disables ordinary recovery or creates a live execution claim.

## ACP cancellation and continuation

Only `stopReason: end_turn` qualifies a production turn for automatic
continuation. Cancellation, limits, refusal and unknown stop reasons stop the
continuation chain and surface the reason. Artifacts are still refreshed so
partial work remains inspectable. A normal turn ending does not establish
visual approval or a completed avatar. Verify cancellation against a real ACP
provider before claiming the complete workflow is validated.

ACP history replay rebuilds messages, tools and permissions without replaying
production completion/error side effects. When the replay's latest state is
working, retain the existing production marker. When it is ready/exited, stop
automatic continuation and request explicit artifact inspection and manual
resumption. This intentionally favors avoiding duplicate writes over silently
restarting a turn that ended during disconnection. Verification still needed
with a real provider: disconnect during a second production turn after an older
completed turn, reconnect, and confirm that the older completion does not clear
the current production marker or submit a new prompt.

## Opaque background evidence

A local review of an existing generated avatar showed all six artifact stages
as observed, yet the white square background visibly rotated in tilt poses.
Pixel inspection found no fully transparent source pixels and opaque corners
in built/base.png. This is a source/background separation defect, not evidence
that pose parameters are wrong. Source preflight now explicitly warns on fully
opaque input, including uniform white backgrounds. Preserve the original;
perform local background separation with edge inspection before rigging, or
report the limitation. Never claim the warning or manifest checks fix it.
Inspect tilt-left/right on a contrasting background before visual approval.
The reviewed private source and derived images were not changed or committed.
