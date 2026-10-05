# Codex interaction reference

The conversation UI follows the public Codex TUI behavior and the installed
app-server protocol. Reference: [openai/codex](https://github.com/openai/codex/tree/823ea830c0fd418b09ff02d36cad9a1fff66465b/codex-rs/tui/src),
commit `823ea830c0fd418b09ff02d36cad9a1fff66465b`.

- Work is grouped per turn. Reasoning summaries, tool arguments, results,
  progress, errors, durations and plan steps remain expandable. Completed
  groups collapse unless the user has explicitly toggled them.
- Responses render sanitized GFM, including lists, tables and copyable code.
- `/` opens a keyboard-accessible command menu. `/skills` and `$` use the
  user's actual skill catalog; requests carry the selected skill name and path.
- `/goal` reads and changes the server's goal, including objective, budget,
  pause/resume and usage. Goal notifications update the UI.
- `/model`, `/plan`, `/new`, `/rename`, `/compact`, `/status`, `/permissions`,
  `/copy` and `/export` act on the current conversation. Plan mode is shared
  across its views and inherited by new conversations.
- Enter during a running turn sends `turn/steer`. Stop pauses an active goal
  before interrupting the turn. Token usage updates the remaining context badge.

This is not the proprietary Codex desktop frontend, and pixel-for-pixel desktop
parity is not claimed. Terminal-specific commands are not exposed. The existing
browser-only permissions remain in effect: listing a skill does not grant it
shell, filesystem or other application access. There is no local imitation of
unsupported backend actions. Unsupported RPCs display the server error.

`extension/tests/setup-ui.cjs` exercises the real UI with controlled protocol
fixtures, without using account credentials or consuming model tokens.
