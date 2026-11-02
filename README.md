# SpaceScan

让每一寸空间，清晰可见。A local disk explorer for Windows, Linux and macOS.

SpaceScan turns folders into a navigable treemap. Click to inspect, double-click to explore, and use the linked file list to search, sort and find large files. File operations stay on your computer.

**Status: first release in development.** See [verification evidence](docs/VERIFICATION.md). A build configuration is not a claim that a platform has passed testing.

## Features

- Folder and drive scans on a background worker, with progress and cancellation.
- Treemap, folder breadcrumbs, sortable/paginated lists and search across the scan.
- File type filters, file details, file-manager reveal and path copying.
- CSV export of the current list/search results.
- Confirmed move to system Trash / Recycle Bin; fresh path and identity checks.
- Chinese and English; light, dark and system appearance.
- No account, server, analytics or file uploads.

## Development

Use Node.js 24 LTS (minimum 22.12) and npm. The first install requires access to npm and Electron's binary distribution.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run test:e2e
npm run benchmark
npm run package
npm run test:packaged
# macOS: mount the DMG, copy the app, verify its signature and run the suite
npm run test:dmg
```

On headless Linux, run desktop tests inside Xvfb (`xvfb-run --auto-servernum npx playwright test` after `npm run build`). The desktop requires a normal graphical session and an available Trash implementation for cleanup. SpaceScan never falls back to permanent deletion.

## Size semantics

File size is the sum of logical file lengths, including separate names for hard links. Estimated allocation uses filesystem blocks on macOS/Linux, with hard-linked file data counted once per scan; directory metadata is included. Windows currently reports logical size only. No promise is made that removing an entry reclaims that many bytes: APFS clones, snapshots, filesystem compression, cloud placeholders and system reservations can produce differences. See the in-app Help.

Symbolic links and junctions are listed but never intentionally followed. Different-device mount points are skipped and listed in scan notes; scan them separately. On modern macOS, choosing the startup root scans its writable Data volume so user files are included. The scan is a point-in-time observation, not an atomic filesystem snapshot.

A scan stops at one million entries to bound memory. Cancelled and limited scans are visibly partial, and cleanup is disabled for partial scans. Errors are counted, with the first 100 paths shown. Unreadable subtrees are marked and excluded from cleanup.

## Packaging

`npm run package` produces local **test artifacts** in `release/test`: macOS `.dmg` / `.zip`, Windows NSIS installer / portable `.exe`, Linux `.AppImage` / `.deb`. `npm run package:dir` creates only the unpacked test app. macOS test builds use an ad-hoc signature without Hardened Runtime; renderer sandboxing and isolation remain enabled. These files are not notarized public releases.

Use `npm run package:release` for public artifacts after setting the actual project homepage and publisher credentials. That mode requires signing on macOS/Windows and configured notarization on macOS. The CI matrix covers macOS Intel and Apple silicon, and x64 Windows/Linux. Build success on another OS is not a substitute for native tests. See [release instructions](docs/RELEASING.md).

Code layout: `electron/scanner.ts` owns the scan index; `electron/worker.ts` keeps it off the UI thread; `electron/main.ts` mediates native actions; `src/` implements the interface; `tests/` exercises the real filesystem and desktop.

## Privacy

SpaceScan reads filenames, paths, types, sizes, timestamps and file identifiers. It does not read file contents while scanning. Preferences and up to six recent scan locations are saved locally in Electron's application-data directory. The index stays in memory and is discarded when the application exits. Exported CSV files contain paths; share them only if intended. No telemetry or automatic network calls are implemented. Updates in the first release are installed manually using a newer installer.

## License

MIT. Bundled dependencies keep their respective licenses. Electron/Chromium notices must remain with all distributed packages.
