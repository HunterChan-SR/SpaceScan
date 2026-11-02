# Verification evidence

## Current state — 2026-11-02

SpaceScan has working test packages for macOS, Windows and Linux. **It is not yet approved for a signed public release:** some native Windows/Linux launcher and installer checks, publisher identity and release signing/notarization remain outstanding. Unsigned test builds can be published as GitHub prereleases (see RELEASING.md). The full three-platform objective is retained; completion depends on the external release gates below.

Host: macOS 26.4.1 arm64, Node 24.17.0. Pinned tools: Electron 45.2.1, TypeScript 7.0.2, Vite 8.3.5, Playwright 1.64.1, electron-builder 26.18.0. The older cached Electron 33 preview was used only for initial development; current tests use 45.2.1.

## Checks completed

- Production build and type checking pass with the pinned tools. The lockfile uses public npm URLs and integrity hashes; all optional dependencies have version entries. A clean `npm ci` in an isolated directory succeeds after repairing one incomplete optional rolldown lock entry. That clean tree builds, passes all 18 core tests, downloads its own Electron runtime on first launch, and passes all 7 desktop tests.
- **18 core tests pass**: real filesystem aggregation, Unicode/hidden entries, navigation/search, symlink cycles (with a Windows-junction branch awaiting Windows execution), hard links, cancellation before/during traversal, entry limit, permission errors, bounded map output, stale IDs, guarded Trash identities/ancestors, macOS Data-volume routing, metadata timeouts, treemap geometry, and multi-batch/atomic CSV export.
- **7 Electron desktop tests pass** on macOS: real scan/navigation/search, sandbox and IPC checks, CSV export, cancelled and confirmed Trash, preferences/reload/keyboard access, and minimum-window layout. Tests now check that a data row and pagination remain visible, not merely that the outer footer is inside the window.
- The macOS arm64 and x64 test DMGs were mounted read-only, their apps copied to isolated installation directories, and signatures verified with `codesign --verify --deep --strict`. The same **7 tests passed for each installed app**. arm64 runs natively; x64 runs through Rosetta on this host and is **not evidence of testing on physical Intel hardware**. After source changes, repeat the DMG suite and check its recorded artifact hash before relying on it.
- Native manual preview checks covered folder selection, tree selection, cross-folder search, CSV save/readback, cancellation of cleanup and successful cleanup. A unique disposable file was also found in OS Trash with intact contents and restored to its original path. Personal files were not moved or removed.
- Light/English and dark/Chinese layouts were visually inspected; the smaller window defect was fixed and regression tested. Treemap text now selects black or white for contrast. Settings are persisted locally.
- Development-server mode was launched on its loopback URL; bootstrap IPC returned locations, with renderer sandbox and context isolation still enabled. A trailing-slash URL validation bug was fixed.
- Production dependency audit: **0 advisories**. Full toolchain audit: 15 moderate findings rooted in a build-only minimatch advisory; no high/critical findings. See SECURITY.md. Application archive inspection confirms those build tools are absent and license notices are present.

## Performance evidence

These are warm-cache fixtures on this Mac, not promises for other disks:

| Files | Entries | Scan | Search/query | Process RSS | Query payload | Errors |
|---|---:|---:|---:|---:|---:|---:|
| 20,000 | 20,201 | 310 ms | 2 ms | 92 MiB | 159 KiB | 0 |
| 100,000 | 101,001 | 1,525 ms | 6 ms | 151 MiB | 160 KiB | 0 |

## Test artifacts

`release/test/` contains eight artifacts: arm64 and x64 macOS DMG/ZIP, Windows x64 NSIS and portable EXEs, Linux x64 AppImage/DEB. These are **test builds**. macOS uses ad-hoc signatures with Hardened Runtime disabled; renderer sandboxing remains enabled. Windows installers are unsigned. Linux test metadata uses a reserved `.invalid` URL until the project homepage is supplied.

`dist/build-info.json` records the source SHA-256. Current build source fingerprint: `d7cc29f7a1fb1ec0dbf8be710bfc86fefec78fa05ae5f7c393bb65b79e7262d4`. Archive matching and installer test records are stored under test-results-evidence. Packaging rejects a stale build. Installer checks and hashes live under `test-results-evidence/` and `release/test/SHA256SUMS.txt`; they are generated local artifacts, not checked-in assertions.

## Remaining release gates

1. Native Windows/Linux CI: the Windows NSIS installer and the unpacked Windows/Linux apps have passed (see CI evidence). The Windows portable launch, Debian installation and Linux AppImage checks must pass in the latest run. Successful cross-builds on macOS do not prove runtime compatibility.
2. ~~Run macOS x64 on a native Intel runner.~~ Passed on `macos-15-intel` in CI.
3. The project homepage is set to the GitHub repository. Set the publisher identity. Configure Developer ID/notarization and Windows signing, then verify the final public artifacts including normal Gatekeeper/Windows behavior. Do not remove quarantine or disable OS protection to claim success.
4. Confirm update-in-place, uninstall and recovery behaviors in the actual native platform sessions. Retain test reports matching final artifact hashes.

## CI evidence — 2026-11-02

The repository is hosted at https://github.com/HunterChan-SR/SpaceScan and its CI has run on GitHub-hosted runners. Run 41446281759 (commit `ca8be69`):

- **macOS arm64 (`macos-latest`) and macOS Intel (`macos-15-intel`)**: every step passed, including core, desktop, packaged-app and DMG installation suites. The Intel job is native x64 evidence, replacing the earlier Rosetta-only result for gate 2.
- **Windows x64**: core, desktop and packaged-app suites passed; the NSIS installer installed, reinstalled in place, passed the desktop suite and was uninstalled. The portable EXE check failed because Playwright's Electron launcher cannot attach through the NSIS portable wrapper (all tests timed out in setup). The check now launches the wrapper and verifies it over the Chromium debugging port.
- **Linux x64 (Ubuntu 22.04)**: core, desktop and packaged-app suites passed. The Debian check failed because `dpkg --install` does not install the package's `libnotify4` dependency; it now installs through `apt-get`. The AppImage check did not run in that job.

Check the latest workflow run before relying on the Windows portable, Debian and AppImage results.

## Latest environment recheck

No native Windows/Linux VM is available locally, and no Developer ID Application identity was returned by the local signing-key inspection. The relevant signing/notarization environment variables are unset. Publisher signing remains outstanding; GitHub test releases are unsigned prereleases.
