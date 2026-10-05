# Contributing

Thanks for helping make browser-native agent workflows more useful.

Start with the [development guide](docs/development.md). For a bug, include clear
reproduction steps, versions, and the layout in use. For a feature, describe the
user problem before proposing an implementation. Keep reports and code in English.

## Pull requests

1. Keep each change focused on one problem.
2. Reuse native browser APIs and existing code before adding dependencies.
3. Put visible UI text in `extension/_locales/en/messages.json`.
4. Preserve tab ownership, scope checks, keyboard navigation, and draft recovery.
5. Run `npm test` and `npm run format:check`. Add a targeted regression check for
   new behavior or nontrivial bugs.
6. Include before/after screenshots for visual changes, using non-sensitive fixtures.
7. Describe the user-visible outcome and any limits in the pull request.

Changes to permissions, authentication, stored data, or native messaging should
explain what access changes and why. Do not add real credentials or conversation
history to fixtures. Tests that use a real account or model must remain opt-in.

There is no required contributor license agreement. Contributions are provided
under the project license, while preserving applicable third-party notices.
Be respectful, specific, and constructive in discussions and reviews.
