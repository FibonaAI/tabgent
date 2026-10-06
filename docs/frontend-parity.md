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
- Running-turn follow-ups follow the desktop queued-message strip: Enter queues
  by default; the row's Steer action submits without interrupting the active run.
  Delete removes the message, and the actions menu edits it in the original
  composer or toggles queueing. There is no separate Queue button or edit dialog.
  Stop interrupts immediately; Escape asks for a second press within two seconds.
  A paused queue exposes Resume. Cmd/Ctrl + Enter inverts the current follow-up
  mode. Shift + Enter inserts a newline. Tab keeps its normal focus behavior. IME composition never submits.
  Reference: the installed desktop's queued-message-list and follow-up preference
  behavior, together with the user-provided composer screenshot.
- Sending and pending delivery states are reconciled using server `clientId`,
  including multiple steers. Failed submissions restore the draft; interrupted,
  unacknowledged steers retain their exact payload behind Retry. Attachments,
  skills and selection anchors travel with queued follow-ups; because the queue
  API accepts only UserInput, anchors use a separate explicitly untrusted text
  block instead of turn/start's `additionalContext` field. The frontend hides this
  metadata while showing the selected quotation.
- Token usage updates the remaining context badge.

This is not the proprietary Codex desktop frontend, and pixel-for-pixel desktop
parity is not claimed. Terminal-specific commands are not exposed. Native tools inherit the installed Codex configuration, including web search,
command execution and configured integrations. Listing a skill does not grant
additional permissions: commands and file operations still use the connector's
read-only sandbox and approval policy. There is no local imitation of
unsupported backend actions. Unsupported RPCs display the server error.

`extension/tests/setup-ui.cjs` exercises the real UI with controlled protocol
fixtures, without using account credentials or consuming model tokens.
