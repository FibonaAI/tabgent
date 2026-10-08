# Chrome Web Store release preparation

Status: Chrome Web Store draft created; not submitted or published.
Store ID: `babedlnnpikldpofiadocebjenlkkflp`. Publisher: Fibona.
Privacy policy and source installation instructions are hosted in this repository. The
connector archive is an unsigned testing build, not a signed/notarized `.pkg`.
The source checkout has no public connector download URL configured.

## Build

```sh
npm run package:store
```

This writes to `dist/store/`:

- `Tabgent-Chrome.zip`: extension runtime only, with `manifest.json` at its root.
  Native Python files, tests and development scripts are excluded. The development
  manifest key is removed; the store assigns the production extension ID.
- `Tabgent-Connector-macOS.zip`: Python connector and a double-clickable installer.
  Requires macOS, Python 3.9+ and compatible Codex. Installs only the connector and
  native-host registrations, preserving any unpacked extension and Codex data.
- `release-status.json`: build identity and remaining release requirements. A
  default build uses the development ID for connector testing and is not ready
  for distribution to store users.

Upload the extension ZIP as a **draft** to obtain the actual store ID. Then rebuild:

```sh
python3 scripts/package-store.py \
  --extension-id ACTUAL_32_CHARACTER_STORE_ID \
  --connector-url https://YOUR_PUBLIC_SITE/download
```

Replace both example values. The installer restricts the native host to that ID;
never use a wildcard. The download URL is bundled in the extension, not fetched
as runtime configuration. Verify that it is publicly accessible and serves the
matching connector before submitting for review. If updating an uploaded draft,
use a higher version when required by the dashboard.

For local testing of the store ZIP, the unpacked extension needs the public key
from the store dashboard to reproduce the store ID. Do not assume its unpacked ID
matches the production ID. Do not change or redistribute anyone's private keys.

## Release requirements

- Register the publisher account and enable two-step verification.
- Confirm the operator name, support contact and public product/download URLs.
  A private repository link is not a public installation or support channel.
- Publish an accurate privacy policy. Review [data handling](../privacy.md),
  [the policy draft](privacy-policy.md) and the actual configured service's terms.
  Do not claim processing is entirely local or that provider retention is zero.
- The initial release uses the documented source installation path and requires
  Python 3.9+. A signed, notarized installer remains a future distribution option.
  Do not instruct users to disable Gatekeeper or other security protections.
- Use [listing copy](listing.md) for English and Simplified Chinese. State the
  macOS, Codex and connector requirements prominently before installation.
- Prepare the required 128×128 icon, 440×280 small promotional tile and screenshots
  at 1280×800 or 640×400. Existing `docs/assets/en/` and `zh-CN/` images are real
  recordings but are not yet the required store dimensions. Keep their actual
  page and answer content when producing store assets.
- Complete the dashboard's single-purpose, permission and data-use declarations.
  [Reviewer notes](reviewer-notes.md) include justifications and a test sequence.
- Provide a legitimate test-access arrangement for reviewers if needed. Do not put
  personal credentials or session tokens in this repository or release archives.
- Test a clean user installation with the store-assigned ID: missing connector,
  missing Python, missing Codex, sign-in, normal use, upgrade and uninstall.
- Review agent-initiated communications: users must be able to confirm message
  content and recipients before messages are sent on their behalf. The existing
  general browser tools do not constitute a verified confirmation gate for every
  website. Resolve this before claiming store compliance.

The broad HTTP(S) permissions, debugger access and local connector require a
careful review. No permission was removed solely to make the declaration shorter;
permission minimization remains part of the release audit. This preparation does
not certify compliance or guarantee approval.

## References

Checked against Chrome's official documentation on 2026-10-07:

- [Prepare the extension](https://developer.chrome.com/docs/webstore/prepare)
- [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Reviewer test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)
