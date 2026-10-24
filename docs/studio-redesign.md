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
