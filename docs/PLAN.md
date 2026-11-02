# SpaceScan first release

Build a desktop disk explorer for Windows, Linux and macOS. All processing stays on the device. The primary experience is a SpaceSniffer-style treemap linked to a sortable file list.

## Acceptance scope

- Real folder and volume selection, asynchronous scanning, progress and cancellation.
- Bounded work and memory; links are never traversed; permission errors and partial scans remain visible.
- File sizes and estimated allocated bytes have distinct meanings; hard links do not double-count allocated bytes; APFS clones and snapshots are explicitly outside the per-file allocation estimate.
- Treemap, breadcrumbs, selection, folder drill-down, global search, file type filters and sorting; usable keyboard and empty/error states; Chinese and English.
- Reveal in the system file manager, copy path, export CSV, and explicit confirmed move to OS Trash/Recycle Bin with fresh identity/scope checks.
- Offline desktop application with sandboxed renderer, narrow validated IPC and no remote executable content.
- Persistent preferences and recent locations; help, version information and a release/update path.
- Platform installer configuration, icons, reproducible locked dependencies, license, privacy/security notes, release instructions and CI on all three operating systems.
- Automated core and real Electron integration tests, large-tree benchmark, manual visual review, and install/launch evidence. Do not claim unexecuted platform checks as passed.

## Current evidence

2026-11-02: Empty project, no inherited AGENTS.md. Host is macOS 26.4.1 arm64 with Node 24.17.0 and command-line developer tools. Windows/Linux execution and release signing must be verified separately; a build configuration alone is not verification.

## Implementation

Electron / TypeScript / React. Scanner owns its index in a worker thread; the renderer receives bounded views and progress, never the entire disk tree. No runtime services or accounts are required. Native APIs provide the folder picker, file manager and Trash.

## Current implementation checkpoint

The scan/index worker, native bridge, full desktop UI, guarded Trash, atomic CSV export, preferences, help, icon generation and four-target CI configuration are implemented. Dependencies are pinned and locked; clean installation/build and 18 core tests pass. macOS desktop and DMG-installed app suites pass on arm64 and x64 through Rosetta. Eight cross-platform test artifacts are built. See VERIFICATION.md for exact evidence and the outstanding native Windows/Linux, Intel-runner and publisher-signing gates. Continue with the original three-platform release objective; this checkpoint is not completion.
