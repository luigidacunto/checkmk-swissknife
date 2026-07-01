# Checkmk SwissKnife

A [Tampermonkey](https://www.tampermonkey.net/) userscript that enhances the Checkmk 2.3.x web interface with quality-of-life improvements for WATO configuration and monitoring views.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Click **Install script** below (or open the raw `.user.js` URL):

   [**Install Checkmk SwissKnife**](https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js)

3. Tampermonkey will detect the `@downloadURL` and prompt for updates automatically.

**Compatibility:** Checkmk 2.3.x · Chrome · Firefox · Edge

## Features

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
After match/ineffective highlighting runs, a **"Relevant only"** button appears above the rule list. Clicking it hides all non-highlighted rows and empty folders, leaving only the rules that matter for the current context.

Applies to: `mode=edit_ruleset` (when at least one highlighted row exists).

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

## How it works

The script injects enhancements at page load and re-applies them on SPA navigation (Checkmk reloads content inside an `<iframe>` without a full page reload). Each feature is independent — a feature that does not apply to the current page does nothing and stops polling.

## License

[CC BY-NC 4.0](LICENSE) — free to use, share, and adapt for non-commercial purposes.
Commercial use or resale is not permitted.
