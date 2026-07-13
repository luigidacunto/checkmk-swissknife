# Checkmk SwissKnife

A [Tampermonkey](https://www.tampermonkey.net/) userscript that enhances the Checkmk 2.3.x web interface with quality-of-life improvements for WATO configuration and monitoring views.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Install the script from one of these sources:

   - [**GreasyFork**](https://greasyfork.org/en/scripts/585184-checkmk-swissknife) *(recommended)*
   - [**Direct install**](https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js)

3. Tampermonkey will detect the `@downloadURL` and prompt for updates automatically.

**Compatibility:** Checkmk 2.3.x · Chrome · Firefox · Edge

## Features

| Feature | Description | Code function |
|---------|-------------|---------------|
| **Folder Path Search** | Replaces the folder dropdown with a searchable overlay — type any path segment to filter instantly | `initSelect2Enhanced` |
| **Accordion Badge Counts** | Shows inline counters in each accordion header: enabled checkboxes (orange), inherited values (blue), differing values vs folder default (red) | `initAccordionCheckedCounts` |
| **Ineffective Rule Highlight** | Replaces the hard-to-spot hyphen icon on ineffective rules with a visible ⚠ badge and amber row border | `highlightIneffectiveRules` |
| **Rule Match Status** | Colors each rule row green (match) or dimmed (no match) when a ruleset is opened with host/service context | `highlightRuleMatchStatus` |
| **Relevant Only Filter** | Adds a "Relevant only" toggle above the rule list to hide all non-matching and non-highlighted rows | `addRulesetFilterToggle` |
| **Extra Column — Host Actions** | Inserts an Extra column in monitoring tables with per-host buttons: Service Discovery, copy FQDN, copy short hostname, copy IP | `addInventoryButtons` |
| **Monitor Button in WATO Folder** | Adds a green eye icon next to each active host in WATO folder listings to open its monitoring view in a new tab | `addWatoFolderMonitorButtons` |
| **Configure in WATO Menu** | Adds a host-selector dropdown and Open button to the monitoring view menu bar for bulk-opening hosts in WATO | `addViewWatoMenu` |
| **Auto-check Foreign Changes** | Automatically ticks the "Activate foreign changes" checkbox on the pending changes page | `tryAutoCheckForeignActivation` |
| **Collapse All / Expand All** | Adds two buttons to the menu bar to collapse or expand all accordion sections at once | `addAccordionToggleButtons` |
| **Site Status Filters** | Adds Disabled / Online / Timeout / Not running toggle buttons below "Add connection" to quickly filter the site connections list | `addSitesFilterBar` |

---

### Folder Path Search
Replaces the default WATO folder dropdown with a searchable overlay. Type any segment of the folder path to filter — separators `>`, `›`, and `/` are treated as equivalent.

Applies to: rule condition editor (`explicit_conditions_p_folder_path`) and monitoring view folder filter (`wato_folder`).

---

### Accordion Badge Counts
Displays inline counters in each accordion section header on host edit pages:

| Badge | Meaning |
|-------|---------|
| **orange `(N)`** | N checkboxes enabled in this section |
| **blue `↑N`** | N values inherited from a parent folder |
| **red `≠N`** | N values that differ from the folder default *(bulk edit only)* |

Applies to: `edit_host`, `bulkedit`, `editfolder`.

---

### Ineffective Rule Highlight
Replaces the low-visibility hyphen icon on ineffective rules with a prominent **`⚠ ineffective`** badge and adds an amber left border to the row.

Applies to: `mode=edit_ruleset`.

---

### Rule Match Status Highlight
When a ruleset is opened in context (URL contains `host=` and/or `service=`), colors each rule row:

- **Green + `✓ match`** — rule applies to the given host/service
- **Dimmed + `✗ no match`** — rule does not apply

Applies to: `mode=edit_ruleset` with host/service context.

---

### Ruleset Filter Toggle
After match/ineffective highlighting runs, a **"Relevant only"** button appears above the rule list. Clicking it hides all `✗ no match` rows, non-highlighted rows and empty folders, leaving only the matching (or ineffective) rules for the current context.

Applies to: `mode=edit_ruleset` (when at least one `✓ match` or ineffective row exists).

---

### Extra Column with Host Actions
Adds a dedicated **Extra** column before the Host column in all monitoring view tables. Each row gets up to four icon buttons:

| Button | Color | Action |
|--------|-------|--------|
| Screen icon | Amber | Opens **Service Discovery** for the host in a new tab |
| Clipboard icon | Blue | Copies the full FQDN to clipboard |
| Clipboard icon | Purple | Copies the short hostname (first label) to clipboard |
| Clipboard icon | Green | Copies the host **IP address** to clipboard *(shown only when available)* |

The IP address is read from the tooltip Checkmk places on the hostname cell. Clicking any clipboard button briefly turns it green to confirm the copy.

Applies to: `view.py` host and service views.

---

### Monitor Button on WATO Folder Pages
Adds a green eye icon next to each active (non-disabled) host in WATO folder listings, opening the host's monitoring view in a new tab. A summary badge on the section header shows monitored vs disabled host counts.

Applies to: `wato.py?mode=folder`.

---

### "Configure in WATO" Menu
Adds a **Select hosts (N)** dropdown and an **Open** button to the monitoring view menu bar. Select a page of hosts, then click **Open** — WATO opens in a new tab with exactly those hosts pre-filtered via regex search, ready for bulk configuration.

- Up to 50 hosts per page (keeps URLs within safe length limits)
- Deduplicates hostnames automatically (useful on service views where hosts repeat)
- **Open** button is disabled (gray) until a page is selected; turns blue when active; resets after opening
- Only visible for users with WATO configuration access

Applies to: `view.py` (admin/configuration role required).

---

### Auto-check "Activate Foreign Changes"
On the **Activate pending changes** page, automatically checks the *Activate foreign changes* checkbox as soon as the page is ready, so you never have to remember to tick it manually before activating.

Applies to: `wato.py?mode=changelog` (with or without sidebar).

---

### Collapse All / Expand All
Adds two buttons to the top menu bar on any page with expandable sections:

| Button | Color | Action |
|--------|-------|--------|
| **Collapse All** | Orange | Collapses all open accordion sections at once |
| **Expand All** | Green | Expands all collapsed accordion sections at once |

Works on both host-edit pages (accordion sections are `table.nform` elements) and ruleset pages (accordion sections are `div.foldable` elements).

Applies to: `edit_host`, `bulkedit`, `editfolder`, `edit_ruleset` (with or without sidebar).

---

### Site Status Filters
Adds a row of quick filter buttons right below the **Add connection** shortcut on the Distributed Monitoring page:

| Button | Color | Shows only sites where... |
|--------|-------|----------------------------|
| **Disabled** | Red | Status connection is Disabled |
| **Online** | Green | Status connection is Online |
| **Timeout** | Orange | Configuration connection reports a read timeout |
| **Not running** | Gray | Configuration connection reports "Site is not running" |

Only one filter can be active at a time — clicking the active button turns it off and shows all sites again. The active filter is highlighted with a solid background so it's always clear which view you're in.

Applies to: `wato.py?mode=sites` (with or without sidebar).

## How it works

The script injects enhancements at page load and re-applies them on SPA navigation (Checkmk reloads content inside an `<iframe>` without a full page reload). Each feature is independent — a feature that does not apply to the current page does nothing and stops polling.

## License

[CC BY-NC 4.0](LICENSE) — free to use, share, and adapt for non-commercial purposes.
Commercial use or resale is not permitted.
