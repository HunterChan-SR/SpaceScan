# Security and privacy

The renderer is sandboxed with Node integration disabled and context isolation enabled. All IPC senders are checked against the app's own main frame. Renderer actions use scan IDs and indexed entry IDs; scanning arbitrary paths is not exposed without prior native selection or an approved location. There is no remote web content, external-window creation, or permission grant handler.

Trash operations require native confirmation, current scan identity, allowed scope and a fresh filesystem check. Roots, home ancestors and system paths are protected. SpaceScan never permanently deletes files or empties Trash. As with other path-based filesystem tools, an adversarial process can race changes after a final path check; do not treat SpaceScan as a security boundary against processes that can modify the same directories.

Scan data is memory-only; recent paths and preferences are local. CSV exports intentionally contain filesystem paths. Debug screenshots and traces may contain filenames; use a disposable fixture when collecting public diagnostics.

For a vulnerability report, contact the repository maintainer privately through the hosting platform's security advisory channel once a project repository is published. Do not include personal file listings in public issues.

The 2026-11-02 npm audit reports zero production dependency advisories. The packaging toolchain has 15 moderate dependency findings rooted in [minimatch glob-pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249). These build-time dependencies are not included in the application archive; the checked-in packaging patterns are controlled by the project, not scanned filenames. Do not apply the audit's suggested downgrade to electron-builder 20, or force minimatch 11 into packages expecting its older callable API. Recheck upstream fixes before each release and build only reviewed source/configuration. No high or critical advisories were reported in this audit.
