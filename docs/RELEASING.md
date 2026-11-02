# Release procedure

## Release gates

Do not publish until all target platforms pass core tests, desktop integration tests, packaged install/launch, folder scan, CSV export and Trash/restore smoke checks. Inspect light/dark appearances and a minimum-size window. Review the evidence in VERIFICATION.md and record actual runner/build versions and artifacts.

1. Install supported, exact dependency versions and commit `package-lock.json`; run `npm ci` from a clean checkout.
2. Run `npm run verify` and `npm run benchmark` locally. Review the dependency audit and Electron security release notes; resolve relevant findings.
3. Push to the intended repository and run the checked-in CI matrix. CI produces **local test installers** in `release/test`, not public releases. macOS uses an ad-hoc signature with Hardened Runtime disabled; the renderer remains sandboxed. These artifacts exercise installation without pretending to have a publisher certificate.
4. Set version in `package.json` and update CHANGELOG.md. Generate icons using `python3 scripts/icons.py` (Pillow required) when changing the icon.
5. Set the actual project homepage in package.json, then run `npm run package:release` with the publisher's signing credentials on trusted runners. The release command rejects missing metadata/signing/notarization rather than silently producing an unsigned release. Inspect the signed, installed application on each OS; do not infer installer behavior from the development process.
6. Generate SHA-256 hashes of final artifacts and publish with version notes only to the user-approved destination. Keep Chromium/Electron and third-party license notices in the distribution.

## GitHub test release

CI uploads `installers-*` (installers and per-runner checksums) and `evidence-*` (test reports) for every run. To publish a GitHub Release, wait for CI on `main` to pass, then push a tag equal to the package version:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The tag run repeats the full matrix. Only when all four runners pass does the `release` job check that the tag matches `package.json`, combine `SHA256SUMS.txt`, and create a **prerelease** with the eight installers. Re-running it replaces the assets of the existing release. These are the unsigned test installers described above; the notes say so and explain the Gatekeeper/SmartScreen prompts. Bump `version` and CHANGELOG.md before tagging the next release.

## Signing

macOS: electron-builder uses `CSC_LINK` / `CSC_KEY_PASSWORD` for a Developer ID Application certificate. Configure Apple notarization using the authentication method supported by the pinned builder, and verify acceptance plus the stapled ticket. Validate `codesign --verify --deep --strict` and `spctl --assess --type execute` on the installed application. `build/entitlements.mac.plist` only enables JIT for Electron. Do not disable Gatekeeper or remove quarantine to claim an installer is ready.

Windows: configure the publisher's Authenticode certificate or supported trusted signing service. Verify the signed installer and application, then exercise install, update-in-place and uninstall. Keep user preferences on uninstall unless the user explicitly chooses to remove them.

Linux: test the AppImage (including the documented system FUSE requirement) and Debian package on supported distributions. Do not ship a `--no-sandbox` launcher. Test trash integration in a normal desktop session.

Never put certificates, private keys, tokens or passwords into the repository or a release archive.

## Verification commands

`npm run build` includes a SHA-256 source fingerprint in `dist/build-info.json`. Packaging refuses a stale build. `npm run test:packaged` runs the same desktop suite against an unpacked test application. `npm run test:dmg` mounts the macOS disk image read-only, copies the app into a temporary installation directory, verifies the ad-hoc signature and tests that copy. It retains the DMG hash and test results in `test-results-evidence/`.

The Windows/Debian installer automation (`scripts/native-installer-smoke.mjs`) is restricted to disposable CI runners with `CI=true`. It installs the package, reinstalls the same version in place, tests the installed executable with isolated preferences, uninstalls, verifies removal of the executable, and records evidence. This does not yet prove migration from a different release version. On Debian the package is installed with `apt-get` so its declared dependencies are installed as they would be for a user; `dpkg --install` alone leaves it unconfigured. `scripts/portable-smoke.mjs` runs the suite by launching the actual Linux AppImage wrapper; the Linux runner installs FUSE 2 rather than bypassing the AppImage launcher. The Windows portable EXE is an NSIS wrapper that runs the extracted app without forwarding its stdio, so Playwright cannot drive it; the script launches the real wrapper, checks the window, version, sandbox and isolation over the Chromium debugging port, closes the window and requires the wrapper to exit cleanly. The unpacked and installed Windows apps run the full suite. These CI definitions must be executed before claiming the platform checks passed.

Generate final hashes with `node scripts/checksums.mjs release/test` for test artifacts or `node scripts/checksums.mjs release` for public artifacts. macOS notarization accepts a complete Apple ID/app-specific-password/team triplet, an API key/id/issuer triplet, or `APPLE_KEYCHAIN_PROFILE`, as supported by the pinned builder.

## Updates

The first release uses manual installer updates. Preferences are kept across upgrades. There is no background download or unsigned remote update channel. Publish new installers and checksums on the project's release page, then install over the existing application. Automatic updating is a later feature, after a release origin and signing policy exist.

## Source references

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder multi-platform builds](https://www.electron.build/docs/features/multi-platform-build/)
- [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
