# Changelog

All notable changes to **Checkmk SwissKnife** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.22.2] - 2026-09-23

### Fixed
- The service name tint applied when hiding the State column now uses Checkmk's actual state colors (green/yellow/red/orange for OK/WARN/CRIT/UNKNOWN) instead of a generic palette — UNKNOWN was showing as purple instead of the native orange.

## [2.22.1] - 2026-09-23

### Added
- "Age" added to the list of native columns the "Columns" dropdown can hide/show.

## [2.22.0] - 2026-09-23

### Added
- "Columns" dropdown in the monitoring view menu bar, on any view.py page with a data table. Lets you hide/show native Checkmk columns that eat horizontal space but aren't always needed (State, Site alias, Host icons, Service icons, Checked, Check command, Groups) — only the columns actually present on the current view are listed, each with its own ON/OFF button plus "Show all"/"Hide all" shortcuts, so it's always clear at a glance what's currently shown. Purely visual, doesn't touch form/checkbox state; the choice is saved and applies to every view. Hiding the State column also tints the service name with that row's state color (green/amber/red/purple), so problems stay identifiable without the column.

### Changed
- "Export to Markdown (.md)", "Copy hosts (JSON)" and "Copy hosts (TSV)" are now grouped under a single "Export ▾" dropdown in the menu bar instead of three separate buttons, to keep the bar from growing too wide now that the Columns dropdown has joined it.

## [2.21.0] - 2026-08-25

### Added
- "Copy hosts (JSON)" and "Copy hosts (TSV)" buttons in the monitoring view menu bar, on any view.py page listing hosts (e.g. "Host search"). Copies hostname (FQDN) and IP for every host on the page — deduplicated, and correctly handling views that render 2 hosts per physical row as side-by-side column pairs — either as JSON or as tab-separated `FQDN\tIP` lines ready to paste into a spreadsheet.

## [2.20.2] - 2026-08-20

### Fixed
- "Configure in WATO" menu still didn't appear on views without a dedicated Host column after the 2.20.1 fix: two activation checks (the initial polling loop and the SPA-navigation re-check) still required the classic `td.nobr` Host column before even attempting to build the menu. Both now also accept the `host=` fallback, so the menu actually gets built on views like "Service search".

## [2.20.1] - 2026-08-20

### Fixed
- "Configure in WATO" menu (host select + "Apri" button) did not appear on views without a dedicated Host column (e.g. "Service search" / `searchsvc`, grouped by service across hosts). Hostnames are now also recovered from any per-row link carrying a `host=` parameter when the classic Host column isn't present.

## [2.20.0] - 2026-07-31

### Added
- "Export to Markdown (.md)" button in the menu bar, on any monitoring view showing a services table (detected by its Host + Display name/Service columns, not tied to one specific view). Exports a Markdown table with whichever of Site, Host, IP, Display name, Summary, Details are present on that view, copies it to the clipboard and downloads it as a `.md` file in one click.

## [2.19.0] - 2026-07-31

### Added
- "Copy host list (JSON)" button in the WATO menu bar on any host-list page (folder browsing or host search results). Copies hostname, alias, IPv4 address and monitored site for every visible host to the clipboard as JSON.

## [2.18.0] - 2026-07-30

### Added
- "Extra column: ON/OFF" button in the monitoring view menu bar (next to "Configure in WATO", when present) to show or hide the Extra column (Service Discovery / copy hostname / copy IP buttons). The choice is saved in the browser and persists across page reloads and views.

## [2.17.0] - 2026-07-30

### Added
- Search box, live "N / total selected" counter and a "Selected only" toggle above large checkbox lists (Checkmk's native ListChoice widget, e.g. "Deploy custom files with agent"), making it easy to find the few relevant checkboxes among hundreds without scrolling. Purely visual filtering — checkbox state and form submission are unaffected.

## [2.16.2] - 2026-07-29

### Changed
- Long hostnames in the Host column of monitoring views (`view.py`) are now truncated to 32 characters with an ellipsis, showing the full name in a tooltip on hover. The copy buttons in the Extra column still copy the full, untruncated hostname.

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
