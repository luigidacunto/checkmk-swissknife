# Changelog

All notable changes to **Checkmk SwissKnife** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.16.1] - 2026-07-13

### Fixed
- "Relevant only" filter bar never appeared on `edit_ruleset` pages opened with host/service context: "no match" rows were counted as relevant, so there was never anything to hide. The filter now hides exactly the non-matching rows.
- Idempotency guard was set at the top of the filter function, so a first attempt running before the rule table rendered blocked all later attempts. The guard is now set only when the bar is actually inserted.

## [2.16.0] - 2026-07-09

### Added
- Quick status filter buttons (Disabled / Online / Timeout / Not running) on the Distributed monitoring page (`mode=sites`). One filter active at a time; clicking the active one clears it.

### Changed
- Declared Checkmk compatibility updated to 2.3.x – 2.4.x.

## [2.15.3] - 2026-07-01

### Changed
- `@homepageURL` now points to the GitHub repository.
- Added `@license CC-BY-NC-4.0` to the UserScript header.
- README: added GreasyFork link in the Installation section.

## [2.15.2] - 2026-07-01

### Fixed
- "Configure in WATO" menu missing on `view.py` without sidebar when there were no pending changes (WATO access detection no longer depends on the changelog link).

## [2.15.1] - 2026-07-01

### Fixed
- Collapse All / Expand All buttons no longer appear on `view.py` (they are only relevant on `wato.py` pages).

## [2.15.0] - 2026-07-01

### Added
- **Collapse All / Expand All** buttons in the top menu bar on pages with accordions (`edit_host`, `bulkedit`, `editfolder`, `edit_ruleset`).

## [2.14.0] - 2026-07-01

### Added
- Dedicated **Extra** column in monitoring view tables with per-host action buttons: open Service Discovery, copy FQDN, copy short hostname, copy IP (from the hostname tooltip).

## [2.13.3] - 2026-06-30

### Added
- Auto-check of the "Activate foreign changes" checkbox when opening the activation page (`mode=changelog`).

## [2.13.2] - 2026-06-30

### Changed
- "Configure in WATO" menu UX: more visible select, `Select hosts (n)` placeholder, "Apri" button starts disabled/grey and turns blue only after a selection.

## [2.13.1] - 2026-06-25

### Changed
- Source comments translated to English; public README added.
- License: CC BY-NC 4.0.

## [2.13.0] - 2026-06-23

### Added
- **Configure in WATO** menu on `view.py`: paginated host select (50 hosts per page) plus an "Apri" button that opens WATO pre-filtered by exact hostname regex for bulk editing.

## [2.12.4] - 2026-06-23

### Changed
- Folder search: `>`, `/` and `›` are treated as equivalent path separators.

## [2.12.3] - 2026-06-23

### Added
- Folder select enhancement extended to the Folder filter (`wato_folder`) in monitoring views.

## [2.12.2] - 2026-06-23

### Added
- Accordion badges on the `editfolder` page (folder properties).

## [2.12.1] - 2026-06-23

### Fixed
- Monitored/disabled host counters and encoding corruption cleanup.

## [2.12.0] - 2026-06-23

### Added
- Monitored/disabled host counters in the WATO folder page heading.

## [2.11.0] - 2026-06-23

### Added
- **Monitoring button** next to each active host on WATO folder pages (`mode=folder`), opening the host monitoring view in a new tab.

## [2.10.0] - 2026-06-19

### Changed
- Service Discovery button restored as `<a>` element, enabling middle-click / open in new tab.

## [2.9.x] - 2026-06-17

### Added
- Service Discovery button next to each hostname on `view.py` (2.9.0).
- Copy-hostname and copy-short-hostname clipboard buttons (2.9.3, 2.9.5).

### Changed
- Iterative icon/spacing refinements on the host action buttons (2.9.1 – 2.9.9).

## [2.8.x] - 2026-06-17

### Added
- **Relevant only** filter toggle on `edit_ruleset`: hides rows and folders not marked by the highlight features (2.8.0).

### Fixed
- Toggle hidden on `edit_ruleset` pages with no active search (2.8.1).

## [2.7.x] - 2026-06-17

### Added
- **Rule match status highlight** on `edit_ruleset` with host/service context: green `✓ match` badge and dimmed `✗ no match` badge replace the barely visible icons (2.7.0).
- Match badges extended to tag-based searches (2.7.1).

## [2.6.x] - 2026-06-17

### Added
- **Ineffective rule highlight** on `edit_ruleset` pages: amber badge and row border replace the `icon_hyphen` icon (2.6).

### Changed
- Versioning migrated to SemVer `major.minor.patch` (2.6.0).

## [2.0 – 2.5] - 2026-06-04 / 2026-06-16

### Added
- Initial public release: **folder path select enhancement** in WATO (full "Root › Level › Leaf" path display with search) (2.0).
- **Accordion badges** on `edit_host`: active checkbox count per section (2.1), inherited-values count (2.2), extension to `bulkedit` (2.4) with conflicting-values badge (2.5).

### Fixed
- URL-based guards so features only activate on their target pages (2.3).
