# WakaWars Release (macOS)

## Packaging

Build signed artifacts (DMG + ZIP + update metadata):

```bash
npm -w apps/wakawars run dist
```

For a local package without publishing metadata:

```bash
npm -w apps/wakawars run pack
```

Artifacts will be output to `apps/wakawars/release/`.

## Auto Update Hosting

Electron-builder generates `latest-mac.yml` alongside the DMG/ZIP. When using the generic provider, you must upload the artifacts and metadata yourself.

The updater is wired to:

```
https://wakawars.molty.app/updates
```

Host `latest-mac.yml`, the DMG, and the ZIP at that path so the app can discover updates.

## Notarization

Electron-builder’s notarization step uses Apple credentials from environment variables. One of these sets must be provided:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (recommended)
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_KEYCHAIN_PROFILE` (optionally paired with `APPLE_KEYCHAIN` for a custom keychain)

Notarization relies on a signed app path and the hardened runtime. The notarize helper accepts either Apple ID credentials, App Store Connect API keys, or a Keychain profile.

## Notes

- Auto-updates on macOS require code signing.
- The default mac target is DMG + ZIP; ZIP is required to generate `latest-mac.yml` for auto-updates.
