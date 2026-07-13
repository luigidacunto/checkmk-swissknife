// ==UserScript==
// @name         Checkmk SwissKnife
// @namespace    https://luigidacunto.com/
// @version      2.16.1
// @checkmk      2.3.x - 2.4.x
// @description  Collection of UI improvements for Checkmk WATO. Each fix or enhancement is added here as an independent feature.
// @author       Luigi D'Acunto
// @homepageURL  https://github.com/luigidacunto/checkmk-swissknife
// @updateURL    https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js
// @downloadURL  https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js
// @include      /^https?:\/\/.+\/check_mk\/(index|wato|view)\.py/
// @grant        none
// @license      CC-BY-NC-4.0
// ==/UserScript==

(function () {
  'use strict';

  // =========================================================================
  // COMMON INFRASTRUCTURE
  // =========================================================================

  const LOG_PREFIX = '[CMK-SK]';
  const POLL_INTERVAL_MS = 500;
  const MAX_ATTEMPTS     = 60;

  // Returns the document to operate on:
  // - If there is an iframe (index.py with sidebar) → use iframe's contentDocument
  // - If wato.py is opened directly → use document only if it contains the target select
  function getWatoDoc(selectId) {
    const iframe = document.querySelector('iframe[name="main"], iframe#main');
    if (iframe) {
      try { return iframe.contentDocument; } catch (e) { return null; }
    }
    if (document.getElementById(selectId) ||
        document.querySelector('select[name*="folder_path"]') ||
        document.getElementById('wato_folder')) {
      return document;
    }
    return null;
  }

  // Reads the "mode" parameter from the target document URL without accessing the DOM
  function getPageMode(iDoc) {
    try { return new URLSearchParams(iDoc.location.search).get('mode') || ''; }
    catch (e) { return ''; }
  }

  // Returns the document to operate on, handling both the iframe case (index.py with
  // sidebar) and the direct case (wato.py opened without sidebar, no iframe present).
  function getTargetDoc() {
    const iframe = document.querySelector('iframe[name="main"], iframe#main');
    if (iframe) { try { return iframe.contentDocument; } catch (e) { return null; } }
    return document;
  }

  // Pages that support accordion badges (same form_edit_host + table.nform structure)
  const ACCORDION_MODES = new Set(['edit_host', 'bulkedit', 'editfolder']);

  // Injects CSS into the target document (once only, deduplicated by id)
  function injectStyles(iDoc, id, css) {
    if (iDoc.getElementById(id)) return;
    const style = iDoc.createElement('style');
    style.id = id;
    style.textContent = css;
    iDoc.head.appendChild(style);
  }


  // =========================================================================
  // FEATURE: Folder Path Select Enhancement
  //
  // Improves the folder path <select> in WATO by showing the full path
  // in "Root › Level › Leaf" style and enabling search on it.
  // Only activates when the #explicit_conditions_p_folder_path select is present.
  // =========================================================================

  const FOLDER_SELECT_ID = 'explicit_conditions_p_folder_path';
  const FOLDER_DIV_ID    = 'explicit_conditions_d_folder_path';

  function formatPath(value) {
    if (!value) return 'Main';
    const parts = value.split('/');
    return parts.map((p, i) =>
      i === parts.length - 1
        ? p.toUpperCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(' › ');
  }

  function enhanceFolderSelect(iDoc) {
    const sel = iDoc.getElementById(FOLDER_SELECT_ID);
    if (!sel) return false;
    if (sel.dataset.cmkEnhanced === '1') return true;

    const iWin = iDoc.defaultView;
    const S2 = iWin.Select2 || (iWin.$ && iWin.$.fn && iWin.$.fn.select2 ? iWin.$ : null);
    if (!S2) return false;

    Array.from(sel.options).forEach(opt => {
      if (!opt.dataset.fullPath) {
        opt.dataset.fullPath = formatPath(opt.value);
      }
    });

    try {
      const existing = getSelect2Instance(iDoc, sel);
      if (existing && typeof existing.destroy === 'function') existing.destroy();
    } catch (e) {
      console.warn(LOG_PREFIX, 'Failed to destroy Select2:', e);
    }

    initSelect2Enhanced(iDoc, sel);
    sel.dataset.cmkEnhanced = '1';
    return true;
  }

  function getSelect2Instance(iDoc, sel) {
    const iWin = iDoc.defaultView;
    if (iWin.$ && iWin.$.fn && iWin.$.fn.select2) {
      try { return iWin.$(sel).data('select2'); } catch (e) {}
    }
    if (iWin.Select2) {
      try { return iWin.Select2.getInstance(sel); } catch (e) {}
    }
    return null;
  }

  function initSelect2Enhanced(iDoc, sel) {
    const iWin = iDoc.defaultView;

    const templateResult = function (option) {
      if (!option.id) return option.text;
      const fullPath = option.element?.dataset?.fullPath || formatPath(option.id);
      const span = iDoc.createElement('span');
      span.title = fullPath;
      span.style.cssText = 'font-family: monospace; font-size: 12px;';
      span.textContent = fullPath;
      return span;
    };

    const templateSelection = function (option) {
      if (!option.id) return option.text;
      return formatPath(option.id);
    };

    const matcher = function (params, option) {
      if (!params.term || params.term.trim() === '') return option;
      const term = params.term.trim().toLowerCase();
      const fullPath = (option.element?.dataset?.fullPath || formatPath(option.id || '')).toLowerCase();
      const leafName = (option.id || '').split('/').pop().toLowerCase();
      if (fullPath.includes(term) || leafName.includes(term)) return option;
      return null;
    };

    const config = {
      width:             'resolve',
      allowClear:        false,
      dropdownAutoWidth: true,
      templateResult,
      templateSelection,
      matcher,
      dropdownCssClass:  'cmk-sk-folder-dropdown',
    };

    if (iWin.$ && iWin.$.fn && iWin.$.fn.select2) {
      try {
        iWin.$(sel).select2(config);
        injectFolderStyles(iDoc);
        return;
      } catch (e) {
        console.warn(LOG_PREFIX, 'jQuery Select2 init failed:', e);
      }
    }

    if (iWin.Select2) {
      try {
        new iWin.Select2(sel, config);
        injectFolderStyles(iDoc);
        return;
      } catch (e) {
        console.warn(LOG_PREFIX, 'Select2 standalone init failed:', e);
      }
    }

    // Fallback: custom search overlay over the native select2
    buildCustomSearchOverlay(iDoc, sel);
  }

  function buildCustomSearchOverlay(iDoc, sel, containerEl) {
    const divContainer = containerEl || iDoc.getElementById(FOLDER_DIV_ID);
    if (!divContainer) return;
    if (divContainer.querySelector('.cmk-sk-folder-overlay')) return;

    const options = Array.from(sel.options).map(opt => ({
      value: opt.value,
      label: opt.value ? formatPath(opt.value) : 'Main',
      original: opt.text.trim()
    }));

    const existingContainer = divContainer.querySelector('.select2-container');
    if (existingContainer) existingContainer.style.display = 'none';

    const wrapper = iDoc.createElement('div');
    wrapper.className = 'cmk-sk-folder-overlay';
    wrapper.style.cssText = `
      display: inline-block;
      position: relative;
      min-width: 300px;
      max-width: 600px;
      width: 100%;
      font-family: var(--font-family, sans-serif);
    `;

    const searchInput = iDoc.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search folder by name or path... (e.g.: veeam, dc1/veeam)';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.style.cssText = `
      width: 100%;
      padding: 4px 8px;
      border: 1px solid #666;
      background: #1a1a2e;
      color: #e0e0e0;
      font-size: 12px;
      font-family: monospace;
      border-radius: 3px;
      box-sizing: border-box;
    `;

    const currentVal = sel.value;
    const currentOpt = options.find(o => o.value === currentVal);
    if (currentOpt) searchInput.value = currentOpt.label;

    const dropdown = iDoc.createElement('div');
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 300px;
      overflow-y: auto;
      background: #1a1a2e;
      border: 1px solid #555;
      border-top: none;
      z-index: 99999;
      display: none;
      font-size: 12px;
      font-family: monospace;
      min-width: 450px;
    `;

    const badge = iDoc.createElement('div');
    badge.style.cssText = `
      font-size: 10px;
      color: #aaa;
      margin-top: 2px;
      padding-left: 2px;
      font-family: monospace;
    `;

    updateBadge();

    function updateBadge() {
      const v = sel.value;
      badge.textContent = v ? `Path: ${v}` : 'Path: / (Main)';
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderDropdown(filter) {
      dropdown.innerHTML = '';
      const term = filter.trim().toLowerCase();
      // Normalize separators: >, ›, / are equivalent in search
      const normTerm = term.replace(/\s*[>/›]\s*/g, '/');
      const filtered = term
        ? options.filter(o =>
            o.label.toLowerCase().includes(term) ||
            o.label.toLowerCase().replace(/\s*›\s*/g, '/').includes(normTerm) ||
            o.value.toLowerCase().includes(normTerm) ||
            o.original.toLowerCase().includes(term)
          )
        : options;

      if (filtered.length === 0) {
        const noRes = iDoc.createElement('div');
        noRes.textContent = 'No results';
        noRes.style.cssText = 'padding: 6px 10px; color: #aaa;';
        dropdown.appendChild(noRes);
      }

      filtered.slice(0, 200).forEach((opt) => {
        const item = iDoc.createElement('div');
        item.dataset.value = opt.value;
        item.style.cssText = `
          padding: 4px 10px;
          cursor: pointer;
          color: #e0e0e0;
          border-bottom: 1px solid #333;
          white-space: nowrap;
        `;

        if (term) {
          const labelLow = opt.label.toLowerCase();
          const idx = labelLow.indexOf(term);
          if (idx >= 0) {
            item.innerHTML =
              escapeHtml(opt.label.substring(0, idx)) +
              '<mark style="background:#f0a500;color:#000;border-radius:2px;">' +
              escapeHtml(opt.label.substring(idx, idx + term.length)) +
              '</mark>' +
              escapeHtml(opt.label.substring(idx + term.length));
          } else {
            item.textContent = opt.label;
          }
        } else {
          item.textContent = opt.label;
        }

        if (opt.value === sel.value) {
          item.style.background = '#2a4a6e';
          item.style.fontWeight = 'bold';
        }

        item.addEventListener('mouseenter', () => { item.style.background = '#3a3a5e'; });
        item.addEventListener('mouseleave', () => {
          item.style.background = opt.value === sel.value ? '#2a4a6e' : '';
        });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectOption(opt.value, opt.label);
        });

        dropdown.appendChild(item);
      });

      if (filtered.length > 200) {
        const more = iDoc.createElement('div');
        more.textContent = `... and ${filtered.length - 200} more results. Refine your search.`;
        more.style.cssText = 'padding: 6px 10px; color: #aaa; font-style: italic;';
        dropdown.appendChild(more);
      }

      dropdown.style.display = 'block';
    }

    function selectOption(value, label) {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      searchInput.value = label;
      dropdown.style.display = 'none';
      updateBadge();
    }

    function highlightItem(items, idx) {
      items.forEach(i => i.classList.remove('highlighted'));
      if (items[idx]) {
        items[idx].classList.add('highlighted');
        items[idx].style.background = '#4a6a9e';
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    }

    searchInput.addEventListener('focus', () => {
      searchInput.select();
      renderDropdown(searchInput.value === currentOpt?.label ? '' : searchInput.value);
    });
    searchInput.addEventListener('input', () => { renderDropdown(searchInput.value); });
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
        const o = options.find(x => x.value === sel.value);
        if (o) searchInput.value = o.label;
      }, 200);
    });
    searchInput.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('[data-value]');
      const current = dropdown.querySelector('[data-value].highlighted');
      const currentIdx = current ? Array.from(items).indexOf(current) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightItem(items, Math.min(currentIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightItem(items, Math.max(currentIdx - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const highlighted = dropdown.querySelector('[data-value].highlighted');
        if (highlighted) {
          selectOption(
            highlighted.dataset.value,
            options.find(o => o.value === highlighted.dataset.value)?.label || highlighted.textContent
          );
        }
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
      }
    });

    wrapper.appendChild(searchInput);
    wrapper.appendChild(dropdown);
    divContainer.appendChild(wrapper);
    divContainer.appendChild(badge);

    sel.dataset.cmkEnhanced = '1';
    injectFolderStyles(iDoc);
  }

  function injectFolderStyles(iDoc) {
    injectStyles(iDoc, 'cmk-sk-folder-styles', `
      .cmk-sk-folder-dropdown .select2-results__option {
        font-family: monospace !important;
        font-size: 12px !important;
        white-space: nowrap !important;
      }
      .cmk-sk-folder-overlay mark {
        background: #f0a500;
        color: #000;
        border-radius: 2px;
        padding: 0 1px;
      }
      .cmk-sk-folder-overlay [data-value].highlighted {
        background: #4a6a9e !important;
      }
    `);
  }


  // =========================================================================
  // FEATURE: Accordion Checked Count Badge
  //
  // Shows in each accordion title on the edit_host page the number
  // of active checkboxes in the group. E.g.: "Services - DB (1)".
  // The counter updates in real time when checkboxes change.
  // =========================================================================

  function updateAccordionBadge(td) {
    const table = td.closest('table.nform');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const checked = tbody.querySelectorAll('input[type=checkbox]:checked').length;
    const badge = td.querySelector('.cmk-sk-acc-count');
    if (!badge) return;
    if (checked > 0) {
      badge.textContent = `(${checked})`;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  function updateInheritedBadge(td, iWin) {
    const table = td.closest('table.nform');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const count = Array.from(tbody.querySelectorAll('div.inherited')).filter(el =>
      iWin.getComputedStyle(el).display !== 'none' && el.textContent.includes('Inherited from')
    ).length;
    const badge = td.querySelector('.cmk-sk-inh-count');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = `↑${count}`;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  function updateDiffBadge(td, iWin) {
    const table = td.closest('table.nform');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const count = Array.from(tbody.querySelectorAll('div.inherited')).filter(el =>
      iWin.getComputedStyle(el).display !== 'none' && el.textContent.includes('This value differs')
    ).length;
    const badge = td.querySelector('.cmk-sk-diff-count');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = `≠${count}`;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  function initAccordionCheckedCounts(iDoc) {
    const form = iDoc.getElementById('form_edit_host');
    if (!form) return false;
    if (form.dataset.cmkAccBadge === '1') return true;

    const iWin = iDoc.defaultView;
    const isBulkEdit = getPageMode(iDoc) === 'bulkedit';

    injectStyles(iDoc, 'cmk-sk-acc-badge-styles', `
      .cmk-sk-acc-count {
        margin-left: 6px;
        padding: 1px 6px;
        background: #f0a500;
        color: #000;
        border-radius: 9px;
        font-size: 11px;
        font-weight: bold;
        vertical-align: middle;
      }
      .cmk-sk-inh-count {
        margin-left: 4px;
        padding: 1px 6px;
        background: #5ba4e5;
        color: #000;
        border-radius: 9px;
        font-size: 11px;
        font-weight: bold;
        vertical-align: middle;
      }
      .cmk-sk-diff-count {
        margin-left: 4px;
        padding: 1px 6px;
        background: #e55b5b;
        color: #fff;
        border-radius: 9px;
        font-size: 11px;
        font-weight: bold;
        vertical-align: middle;
      }
    `);

    iDoc.querySelectorAll('table.nform thead tr.heading td').forEach(td => {
      const table = td.closest('table.nform');
      const tbody = table?.querySelector('tbody');
      if (!tbody) return;

      const badge = iDoc.createElement('span');
      badge.className = 'cmk-sk-acc-count';
      badge.style.display = 'none';

      const badgeInh = iDoc.createElement('span');
      badgeInh.className = 'cmk-sk-inh-count';
      badgeInh.style.display = 'none';

      const img = td.querySelector('img.treeangle');
      const afterImg = img?.nextSibling;
      if (afterImg) {
        afterImg.after(badge);
        badge.after(badgeInh);
      } else {
        td.appendChild(badge);
        td.appendChild(badgeInh);
      }

      if (isBulkEdit) {
        const badgeDiff = iDoc.createElement('span');
        badgeDiff.className = 'cmk-sk-diff-count';
        badgeDiff.style.display = 'none';
        badgeInh.after(badgeDiff);
      }

      updateAccordionBadge(td);
      updateInheritedBadge(td, iWin);
      if (isBulkEdit) updateDiffBadge(td, iWin);

      tbody.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
          updateAccordionBadge(td);
          updateInheritedBadge(td, iWin);
          if (isBulkEdit) updateDiffBadge(td, iWin);
        }
      });
    });

    form.dataset.cmkAccBadge = '1';
    return true;
  }


  // =========================================================================
  // FEATURE: Ineffective Rule Highlight
  //
  // In mode=edit_ruleset pages, replaces the barely visible
  // "icon_hyphen.svg" (title="Ineffective rule") icon with a colored badge
  // and adds a left border to the row.
  // Works on both direct wato.py (no iframe) and inside index.py (iframe).
  // =========================================================================

  function highlightIneffectiveRules(doc) {
    if (doc.body.dataset.cmkIneffHighlight === '1') return;

    const imgs = doc.querySelectorAll('img.icon[title="Ineffective rule"]');
    if (!imgs.length) return;

    injectStyles(doc, 'cmk-sk-ineff-styles', `
      tr.cmk-sk-ineffective > td:first-child {
        border-left: 4px solid #e5a500 !important;
      }
      tr.cmk-sk-ineffective {
        background: rgba(229, 165, 0, 0.08) !important;
      }
      .cmk-sk-ineff-badge {
        display: inline-block;
        background: #e5a500;
        color: #000;
        font-size: 10px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        font-family: monospace;
        vertical-align: middle;
        cursor: default;
        letter-spacing: 0.03em;
      }
    `);

    imgs.forEach(img => {
      const row = img.closest('tr');
      if (!row || row.classList.contains('cmk-sk-ineffective')) return;
      row.classList.add('cmk-sk-ineffective');

      const badge = doc.createElement('span');
      badge.className = 'cmk-sk-ineff-badge';
      badge.title = 'Ineffective rule';
      badge.textContent = '⚠ ineffective';
      img.replaceWith(badge);
    });

    doc.body.dataset.cmkIneffHighlight = '1';
  }


  // =========================================================================
  // FEATURE: Rule Match Status Highlight
  //
  // In mode=edit_ruleset pages opened with host/service context (host= and
  // service= parameters in the URL), highlights matching rows (green) and
  // dims non-matching ones (grey), replacing the barely visible icon_checkmark
  // and icon_hyphen icons with colored badges.
  // =========================================================================

  function highlightRuleMatchStatus(doc) {
    if (doc.body.dataset.cmkMatchHighlight === '1') return;

    const matchImgs   = doc.querySelectorAll('img.icon[title^="This rule matches"], img.icon[title="Matches"]');
    const noMatchImgs = doc.querySelectorAll('img.icon[title^="This rule does not match"]');
    if (!matchImgs.length && !noMatchImgs.length) return;

    injectStyles(doc, 'cmk-sk-match-styles', `
      tr.cmk-sk-rule-match > td:first-child {
        border-left: 4px solid #4caf50 !important;
      }
      tr.cmk-sk-rule-match {
        background: rgba(76, 175, 80, 0.10) !important;
      }
      tr.cmk-sk-rule-nomatch {
        opacity: 0.45;
      }
      tr.cmk-sk-rule-nomatch > td:first-child {
        border-left: 4px solid #555 !important;
      }
      .cmk-sk-match-badge {
        display: inline-block;
        background: #4caf50;
        color: #fff;
        font-size: 10px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        font-family: monospace;
        vertical-align: middle;
        cursor: default;
        letter-spacing: 0.03em;
      }
      .cmk-sk-nomatch-badge {
        display: inline-block;
        background: #444;
        color: #888;
        font-size: 10px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        font-family: monospace;
        vertical-align: middle;
        cursor: default;
        letter-spacing: 0.03em;
      }
    `);

    matchImgs.forEach(img => {
      const row = img.closest('tr');
      if (!row) return;
      row.classList.add('cmk-sk-rule-match');
      const badge = doc.createElement('span');
      badge.className = 'cmk-sk-match-badge';
      badge.title = img.title;
      badge.textContent = '✓ match';
      img.replaceWith(badge);
    });

    noMatchImgs.forEach(img => {
      const row = img.closest('tr');
      if (!row) return;
      row.classList.add('cmk-sk-rule-nomatch');
      const badge = doc.createElement('span');
      badge.className = 'cmk-sk-nomatch-badge';
      badge.title = img.title;
      badge.textContent = '✗ no match';
      img.replaceWith(badge);
    });

    doc.body.dataset.cmkMatchHighlight = '1';
  }


  // =========================================================================
  // FEATURE: Ruleset Filter Toggle
  //
  // After the highlight functions have marked the relevant rows
  // (match, no-match, ineffective), adds a bar at the top with a button
  // to hide rows and folders with no relevance. Useful on pages with
  // hundreds of rules where only a few are relevant.
  // =========================================================================

  function addRulesetFilterToggle(doc) {
    if (doc.body.dataset.cmkFilterToggle === '1') return;

    // Le righe "no match" NON sono rilevanti: il filtro serve proprio a nasconderle
    const RELEVANT_SEL = 'tr.cmk-sk-rule-match, tr.cmk-sk-ineffective';

    // No highlighted rows = no active search, toggle is useless
    const relevantCount = doc.querySelectorAll(RELEVANT_SEL).length;
    if (!relevantCount) return;

    doc.querySelectorAll('tr.data').forEach(row => {
      if (!row.matches(RELEVANT_SEL)) row.classList.add('cmk-sk-irrelevant-row');
    });

    doc.querySelectorAll('div.foldable_wrapper').forEach(wrapper => {
      if (!wrapper.querySelector(RELEVANT_SEL)) wrapper.classList.add('cmk-sk-irrelevant-folder');
    });

    const irrelevantRows    = doc.querySelectorAll('tr.cmk-sk-irrelevant-row').length;
    const irrelevantFolders = doc.querySelectorAll('div.foldable_wrapper.cmk-sk-irrelevant-folder').length;

    if (!irrelevantRows && !irrelevantFolders) return;

    // Guard settato solo qui: se la tabella non era ancora renderizzata
    // il prossimo tentativo deve poter riprovare
    doc.body.dataset.cmkFilterToggle = '1';

    injectStyles(doc, 'cmk-sk-filter-toggle-styles', `
      #cmk-sk-filter-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 10px;
        margin: 6px 0 4px 0;
        background: rgba(0,0,0,0.25);
        border: 1px solid #3a3a3a;
        border-radius: 4px;
        font-size: 11px;
        color: #999;
        font-family: monospace;
      }
      #cmk-sk-filter-toggle-btn {
        cursor: pointer;
        padding: 3px 10px;
        border-radius: 3px;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #bbb;
        font-size: 11px;
        font-family: monospace;
        font-weight: bold;
        letter-spacing: 0.03em;
      }
      #cmk-sk-filter-toggle-btn:hover { background: #383838; }
      #cmk-sk-filter-toggle-btn.active {
        background: #1c3320;
        border-color: #4caf50;
        color: #4caf50;
      }
      body.cmk-sk-filter-active tr.cmk-sk-irrelevant-row { display: none !important; }
      body.cmk-sk-filter-active div.foldable_wrapper.cmk-sk-irrelevant-folder { display: none !important; }
    `);

    const bar = doc.createElement('div');
    bar.id = 'cmk-sk-filter-bar';

    const btn = doc.createElement('button');
    btn.id = 'cmk-sk-filter-toggle-btn';
    btn.type = 'button';
    btn.textContent = 'Relevant only';

    const info = doc.createElement('span');
    info.textContent = `${relevantCount} relevant · ${irrelevantRows} rows and ${irrelevantFolders} folders not relevant`;

    btn.addEventListener('click', () => {
      const isActive = doc.body.classList.toggle('cmk-sk-filter-active');
      btn.classList.toggle('active', isActive);
      btn.textContent = isActive ? 'Show all' : 'Relevant only';
    });

    bar.appendChild(btn);
    bar.appendChild(info);

    const anchor = doc.querySelector('div.foldable_wrapper') || doc.querySelector('div.wato');
    if (anchor) anchor.before(bar);
  }


  // =========================================================================
  // FEATURE: Inventory Button on view.py
  //
  // In view.py pages (monitoring views), adds a small button next to each
  // hostname in the Host column to directly open the host's Service Discovery
  // page in a new tab.
  // =========================================================================

  function addInventoryButtons(doc) {
    if (doc.body.dataset.cmkInventoryBtns === '1') return;

    const tables = doc.querySelectorAll('table.data');
    if (!tables.length) return;

    injectStyles(doc, 'cmk-sk-inv-btn-styles', `
      .cmk-sk-extra-th { text-align: center; padding: 2px 6px; font-size: 11px; white-space: nowrap; }
      .cmk-sk-extra-td { white-space: nowrap; padding: 1px 4px; vertical-align: middle; text-align: center; }
      .cmk-sk-btn-group { display: inline-flex; align-items: center; gap: 2px; }
      .cmk-sk-inv-btn, .cmk-sk-copy-btn, .cmk-sk-copy-short-btn, .cmk-sk-copy-ip-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 16px !important;
        height: 16px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        opacity: 0.8;
        padding: 0 !important;
        margin: 1px !important;
        box-sizing: border-box !important;
        text-decoration: none !important;
        font-size: 0 !important;
        line-height: 0 !important;
        vertical-align: middle !important;
      }
      .cmk-sk-inv-btn, .cmk-sk-inv-btn:visited {
        background: rgba(229,165,0,0.08) !important;
        color: #e5a500 !important;
        border: 1px solid #e5a500 !important;
      }
      .cmk-sk-inv-btn:hover { opacity: 1 !important; background: rgba(229,165,0,0.18) !important; }
      .cmk-sk-copy-btn { background: rgba(90,180,214,0.08) !important; color: #5ab4d6 !important; border: 1px solid #5ab4d6 !important; }
      .cmk-sk-copy-btn:hover { opacity: 1; background: rgba(90,180,214,0.18) !important; }
      .cmk-sk-copy-short-btn { background: rgba(160,120,200,0.08) !important; color: #a078c8 !important; border: 1px solid #a078c8 !important; }
      .cmk-sk-copy-short-btn:hover { opacity: 1; background: rgba(160,120,200,0.18) !important; }
      .cmk-sk-copy-ip-btn { background: rgba(102,187,106,0.08) !important; color: #66bb6a !important; border: 1px solid #66bb6a !important; }
      .cmk-sk-copy-ip-btn:hover { opacity: 1; background: rgba(102,187,106,0.18) !important; }
      .cmk-sk-copy-btn.copied, .cmk-sk-copy-short-btn.copied, .cmk-sk-copy-ip-btn.copied {
        border-color: #4caf50 !important;
        color: #4caf50 !important;
        background: rgba(76,175,80,0.12) !important;
        opacity: 1;
      }
      .cmk-sk-btn-group svg { display: block; }
    `);

    const CLIP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const DISC_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="6 9 9 12 14 7" stroke-width="2"/></svg>';

    function mkCopy(cls, text, label) {
      const b = doc.createElement('button');
      b.className = cls; b.type = 'button'; b.title = label; b.innerHTML = CLIP_SVG;
      b.addEventListener('click', () => navigator.clipboard.writeText(text).then(() => {
        b.classList.add('copied'); setTimeout(() => b.classList.remove('copied'), 900);
      }));
      return b;
    }

    let found = false;

    tables.forEach(table => {
      // Trova indice colonna host dalla prima riga dati con link host
      let hostColIdx = -1;
      for (const tr of table.querySelectorAll('tr.data')) {
        const cells = [...tr.children];
        for (let i = 0; i < cells.length; i++) {
          if (!cells[i].classList.contains('nobr')) continue;
          const a = cells[i].querySelector('a[href*="host="]');
          if (!a) continue;
          const h = new URLSearchParams(a.getAttribute('href').split('?')[1] || '').get('host');
          if (h) { hostColIdx = i; break; }
        }
        if (hostColIdx !== -1) break;
      }
      if (hostColIdx === -1) return;

      found = true;

      // Inserisci <th>Extra</th> nell'header (primo tr con th figli)
      const headerRow = [...table.querySelectorAll('tr')].find(tr => tr.querySelector('th'));
      if (headerRow && !headerRow.querySelector('.cmk-sk-extra-th')) {
        const th = doc.createElement('th');
        th.textContent = 'Extra';
        th.className = 'cmk-sk-extra-th';
        headerRow.insertBefore(th, [...headerRow.children][hostColIdx] || null);
      }

      // Aggiorna colspan dei groupheader
      table.querySelectorAll('tr.groupheader td[colspan]').forEach(td => { td.colSpan++; });

      // Processa righe dati
      table.querySelectorAll('tr.data').forEach(tr => {
        if (tr.querySelector('.cmk-sk-extra-td')) return;
        const cells = [...tr.children];
        const hostTd = cells[hostColIdx];
        const extraTd = doc.createElement('td');
        extraTd.className = 'cmk-sk-extra-td';

        if (hostTd && hostTd.classList.contains('nobr')) {
          const a = hostTd.querySelector('a[href*="host="]');
          // IP è nel title dello span che wrappa l'anchor: <span title="x.x.x.x"><a>...</a></span>
          const ip = (hostTd.querySelector('span[title]') || {}).title || null;
          if (a) {
            const h = new URLSearchParams(a.getAttribute('href').split('?')[1] || '').get('host');
            if (h) {
              const hostname = h, shortname = h.split('.')[0];
              const group = doc.createElement('span');
              group.className = 'cmk-sk-btn-group';

              const disc = doc.createElement('a');
              disc.className = 'cmk-sk-inv-btn';
              disc.href = `wato.py?host=${encodeURIComponent(hostname)}&mode=inventory`;
              disc.target = '_blank'; disc.rel = 'noopener';
              disc.title = `Service Discovery: ${hostname}`;
              disc.innerHTML = DISC_SVG;

              group.appendChild(disc);
              group.appendChild(mkCopy('cmk-sk-copy-btn', hostname, `Copy hostname: ${hostname}`));
              group.appendChild(mkCopy('cmk-sk-copy-short-btn', shortname, `Copy short hostname: ${shortname}`));
              if (ip) group.appendChild(mkCopy('cmk-sk-copy-ip-btn', ip, `Copy IP: ${ip}`));

              extraTd.appendChild(group);
            }
          }
        }
        tr.insertBefore(extraTd, hostTd || null);
      });
    });

    if (found) doc.body.dataset.cmkInventoryBtns = '1';
  }


  // =========================================================================
  // FEATURE: Monitor Button on wato.py (mode=folder)
  //
  // In WATO folder pages, adds a small button next to the hostname of each
  // active (non-disabled) host to open the monitoring view in a new tab.
  // The button occupies the space where the X icon appears for disabled hosts,
  // maintaining column alignment.
  // =========================================================================

  function addWatoFolderMonitorButtons(doc) {
    if (doc.body.dataset.cmkFolderMonBtns === '1') return;

    const base = doc.location.pathname.replace(/[^/]*$/, '');

    injectStyles(doc, 'cmk-sk-folder-mon-btn-styles', `
      .cmk-sk-mon-btn, .cmk-sk-mon-btn:visited {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 20px !important;
        height: 20px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        opacity: 0.85;
        flex-shrink: 0;
        padding: 0 !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        text-decoration: none !important;
        font-size: 0 !important;
        line-height: 0 !important;
        vertical-align: middle !important;
        background: rgba(76,175,80,0.1) !important;
        color: #4caf50 !important;
        border: 1px solid #4caf50 !important;
      }
      .cmk-sk-mon-btn:hover { opacity: 1 !important; background: rgba(76,175,80,0.22) !important; }
      .cmk-sk-mon-btn svg { display: block; }
    `);

    const EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

    let active = 0, disabled = 0;
    doc.querySelectorAll('table.data td').forEach(td => {
      // Hostname cell: contains exactly one link with mode=edit_host whose text is the hostname
      const links = td.querySelectorAll('a[href*="mode=edit_host"]');
      if (links.length !== 1) return;
      const link = links[0];
      const hostname = new URLSearchParams((link.getAttribute('href') || '').split('?')[1] || '').get('host');
      if (!hostname || link.textContent.trim() !== hostname) return;

      // Skip disabled hosts (they have an img with title="This host is disabled" in the same cell)
      if (td.querySelector('img[title="This host is disabled"]')) { disabled++; return; }

      // Prevent duplicate insertion
      if (td.querySelector('.cmk-sk-mon-btn')) return;

      const viewUrl = base + 'view.py?host=' + encodeURIComponent(hostname) + '&view_name=host';
      const href = base + 'index.py?start_url=' + encodeURIComponent(viewUrl);

      const btn = doc.createElement('a');
      btn.className = 'cmk-sk-mon-btn';
      btn.href = href;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.title = `Monitoring: ${hostname}`;
      btn.innerHTML = EYE_SVG;
      td.insertBefore(btn, link);
      td.insertBefore(doc.createTextNode(' '), link);
      active++;
    });

    const h3 = doc.querySelector('h3.table');
    if (h3 && !h3.querySelector('.cmk-sk-folder-summary')) {
      const summary = doc.createElement('span');
      summary.className = 'cmk-sk-folder-summary';
      summary.style.cssText = 'float:right;font-size:12px;font-weight:normal;opacity:0.75;letter-spacing:0.02em;';
      summary.innerHTML =
        '<span style="color:#4caf50">&#9679; ' + active + ' monitorati</span>' +
        '<span style="margin:0 6px;opacity:0.4;">|</span>' +
        '<span style="color:#e05050">&#9679; ' + disabled + ' disabilitati</span>';
      h3.appendChild(summary);
    }

    if (active > 0 || disabled > 0) doc.body.dataset.cmkFolderMonBtns = '1';
  }


  // =========================================================================
  // FEATURE: "Configure in WATO" menu on view.py
  //
  // Adds a paginated <select> to the menu bar (Commands/Hosts/Export/...) of
  // live monitoring views. Each option opens WATO with a group of up to 50
  // hosts, pre-filtered by exact hostname via regex ~^(h1|h2|...)$.
  // =========================================================================

  const WATO_PAGE_SIZE = 50;

  // True if the current user has WATO access (admin/configuration role).
  // With sidebar: outer document has wato.py links in Setup nav.
  // Without sidebar: any wato.py link in the page suffices (incl. injected Extra column buttons).
  function hasWatoAccess(doc) {
    if (document !== doc && document.querySelector('a[href*="wato.py"]')) return true;
    if (doc.querySelector('a[href*="wato.py"]')) return true;
    return false;
  }

  function addViewWatoMenu(doc) {
    if (doc.body.dataset.cmkViewWatoMenu === '1') return;
    doc.body.dataset.cmkViewWatoMenu = '1';
    if (!hasWatoAccess(doc)) return;

    try { if (!/\/view\.py/.test(doc.location.pathname)) return; } catch (e) { return; }

    const menues = doc.querySelector('#page_menu_bar td.menues');
    if (!menues) return;

    const hosts = [...new Set(
      [...doc.querySelectorAll('tr.data td.nobr a[href*="host="]')]
        .map(a => { const m = a.href.match(/[?&]host=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; })
        .filter(Boolean)
    )];
    if (!hosts.length) return;

    const folder = new URLSearchParams(doc.location.search).get('wato_folder') || '';
    const base = doc.location.pathname.replace(/[^/]*$/, '');
    const pages = Math.ceil(hosts.length / WATO_PAGE_SIZE);

    const wrapper = doc.createElement('div');
    wrapper.className = 'cmk-sk-wato-menu';
    wrapper.style.cssText = 'display:inline-flex;align-items:center;padding:0 8px;border-left:1px solid rgba(255,255,255,0.15);';

    const sel = doc.createElement('select');
    sel.style.cssText = 'background:#444;color:#ddd;border:1px solid #888;border-radius:3px;padding:2px 5px;font-size:12px;cursor:pointer;vertical-align:middle;';

    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Select hosts (' + hosts.length + ')';
    sel.appendChild(placeholder);

    for (let i = 0; i < pages; i++) {
      const start = i * WATO_PAGE_SIZE;
      const end = Math.min(start + WATO_PAGE_SIZE, hosts.length);
      const opt = doc.createElement('option');
      opt.value = i;
      opt.textContent = 'Host ' + (start + 1) + '-' + end;
      sel.appendChild(opt);
    }

    const BTN_STYLE_OFF = 'margin-left:4px;background:#555;color:#999;border:1px solid #777;border-radius:3px;padding:2px 7px;font-size:12px;cursor:not-allowed;vertical-align:middle;';
    const BTN_STYLE_ON  = 'margin-left:4px;background:#1a73e8;color:#fff;border:1px solid #1a73e8;border-radius:3px;padding:2px 7px;font-size:12px;cursor:pointer;vertical-align:middle;';

    const btn = doc.createElement('button');
    btn.textContent = 'Apri';
    btn.disabled = true;
    btn.style.cssText = BTN_STYLE_OFF;

    sel.addEventListener('change', function () {
      const valid = sel.value !== '';
      btn.disabled = !valid;
      btn.style.cssText = valid ? BTN_STYLE_ON : BTN_STYLE_OFF;
    });

    btn.addEventListener('click', function () {
      const page = parseInt(sel.value);
      if (isNaN(page)) return;
      const slice = hosts.slice(page * WATO_PAGE_SIZE, (page + 1) * WATO_PAGE_SIZE);
      const regex = '~^(' + slice.join('|') + ')$';
      const url = location.origin + base + 'wato.py?mode=folder'
        + (folder ? '&folder=' + encodeURIComponent(folder) : '')
        + '&host_search=1'
        + '&host_search_host=' + encodeURIComponent(regex)
        + '&filled_in=edit_host';
      window.open(url, '_blank');
      sel.value = '';
      btn.disabled = true;
      btn.style.cssText = BTN_STYLE_OFF;
    });

    wrapper.appendChild(sel);
    wrapper.appendChild(btn);
    menues.appendChild(wrapper);
  }


  // =========================================================================
  // FEATURE: Quick status filters on Distributed Monitoring (mode=sites)
  //
  // Adds a row below the "Add connection" shortcut with 4 toggle buttons that
  // filter the site connection list: Disabled / Online (from the
  // livestatus_status_<site> icon title), Timeout and Not running (any
  // connection_status block in the row reporting a read timeout, resp.
  // "Site is not running" - both typically found in the Configuration
  // connection / replication_status column).
  // Only one filter can be active at a time; clicking the active one clears it.
  // =========================================================================

  const SITES_FILTER_PREDICATES = {
    disabled:  row => row.querySelector('[id^="livestatus_status_"] img')?.title === 'Disabled',
    online:    row => row.querySelector('[id^="livestatus_status_"] img')?.title === 'Online',
    timeout:   row => [...row.querySelectorAll('.connection_status')].some(d => d.textContent.includes('Read timed out')),
    notrunning: row => [...row.querySelectorAll('.connection_status')].some(d => d.textContent.includes('Site is not running')),
  };

  const SITES_FILTER_LABELS = { notrunning: 'Not running' };

  function addSitesFilterBar(doc) {
    if (doc.body.dataset.cmkSitesFilter === '1') return;
    const suggestionsRow = doc.getElementById('suggestions');
    const sitesTable = doc.querySelector('table.data');
    if (!suggestionsRow || !sitesTable) return;
    doc.body.dataset.cmkSitesFilter = '1';

    injectStyles(doc, 'cmk-sk-sites-filter-style', `
      #cmk-sk-sites-filter-bar {
        display: flex; align-items: center; gap: 6px; padding: 4px 0;
        font-family: monospace; font-size: 11px;
      }
      .cmk-sk-sites-filter-btn {
        cursor: pointer; padding: 3px 10px; border-radius: 3px;
        background: transparent; font-weight: bold; letter-spacing: 0.03em;
        transition: background-color .1s, color .1s;
      }
      .cmk-sk-sites-filter-btn.disabled   { color: #e74c3c; border: 1px solid #e74c3c; }
      .cmk-sk-sites-filter-btn.disabled:hover   { background: rgba(231,76,60,0.15); }
      .cmk-sk-sites-filter-btn.disabled.active  { background: #e74c3c; color: #fff; }
      .cmk-sk-sites-filter-btn.online     { color: #27ae60; border: 1px solid #27ae60; }
      .cmk-sk-sites-filter-btn.online:hover     { background: rgba(39,174,96,0.15); }
      .cmk-sk-sites-filter-btn.online.active    { background: #27ae60; color: #fff; }
      .cmk-sk-sites-filter-btn.timeout    { color: #e67e22; border: 1px solid #e67e22; }
      .cmk-sk-sites-filter-btn.timeout:hover    { background: rgba(230,126,34,0.15); }
      .cmk-sk-sites-filter-btn.timeout.active   { background: #e67e22; color: #fff; }
      .cmk-sk-sites-filter-btn.notrunning { color: #999; border: 1px solid #999; }
      .cmk-sk-sites-filter-btn.notrunning:hover { background: rgba(153,153,153,0.15); }
      .cmk-sk-sites-filter-btn.notrunning.active { background: #999; color: #111; }
    `);

    const tr = doc.createElement('tr');
    const td = doc.createElement('td');
    td.colSpan = 3;
    const bar = doc.createElement('div');
    bar.id = 'cmk-sk-sites-filter-bar';

    let active = null;
    const buttons = {};

    function applyFilter() {
      sitesTable.querySelectorAll('tr.data').forEach(row => {
        row.style.display = (!active || SITES_FILTER_PREDICATES[active](row)) ? '' : 'none';
      });
      Object.entries(buttons).forEach(([key, btn]) => btn.classList.toggle('active', key === active));
    }

    Object.keys(SITES_FILTER_PREDICATES).forEach(key => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'cmk-sk-sites-filter-btn ' + key;
      btn.textContent = SITES_FILTER_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));
      btn.addEventListener('click', () => {
        active = active === key ? null : key;
        applyFilter();
      });
      buttons[key] = btn;
      bar.appendChild(btn);
    });

    td.appendChild(bar);
    tr.appendChild(td);
    suggestionsRow.after(tr);
  }

  function tryAddSitesFilterBar() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsSitesFilter < MAX_ATTEMPTS) setTimeout(tryAddSitesFilterBar, POLL_INTERVAL_MS);
      return;
    }
    if (getPageMode(doc) !== 'sites') return;
    if (!doc.getElementById('suggestions') || !doc.querySelector('table.data')) {
      if (++attemptsSitesFilter < MAX_ATTEMPTS) setTimeout(tryAddSitesFilterBar, POLL_INTERVAL_MS);
      return;
    }
    addSitesFilterBar(doc);
  }


  // =========================================================================
  // BOOTSTRAP: polling for each feature, activated only if the select is present
  // =========================================================================

  let attemptsFolder    = 0;
  let attemptsAcc       = 0;
  let attemptsRuleset   = 0;
  let attemptsInventory = 0;
  let attemptsFolderMon = 0;
  let attemptsViewWato  = 0;
  let attemptsChangelog = 0;
  let attemptsAccToggle = 0;
  let attemptsSitesFilter = 0;

  function tryEnhanceFolderSelect() {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    if (!iDoc || !iDoc.body) {
      if (++attemptsFolder < MAX_ATTEMPTS) setTimeout(tryEnhanceFolderSelect, POLL_INTERVAL_MS);
      return;
    }

    const sel   = iDoc.getElementById(FOLDER_SELECT_ID);
    const selVF = iDoc.getElementById('wato_folder');
    if (!sel && !selVF) return;

    if (sel && !sel.dataset.cmkEnhanced) {
      if (!sel.classList.contains('select2-hidden-accessible')) {
        if (++attemptsFolder < MAX_ATTEMPTS) setTimeout(tryEnhanceFolderSelect, POLL_INTERVAL_MS);
        return;
      }
      buildCustomSearchOverlay(iDoc, sel);
    }
    if (selVF && !selVF.dataset.cmkEnhanced) {
      if (!selVF.classList.contains('select2-hidden-accessible')) {
        if (++attemptsFolder < MAX_ATTEMPTS) setTimeout(tryEnhanceFolderSelect, POLL_INTERVAL_MS);
        return;
      }
      buildCustomSearchOverlay(iDoc, selVF, selVF.closest('.floatfilter') || selVF.parentElement);
    }
  }

  function tryInitAccordionCounts() {
    const iDoc = getWatoDoc('form_edit_host');
    if (!iDoc || !iDoc.body) {
      if (++attemptsAcc < MAX_ATTEMPTS) setTimeout(tryInitAccordionCounts, POLL_INTERVAL_MS);
      return;
    }
    // URL guard: only activates on pages with supported accordions
    if (!ACCORDION_MODES.has(getPageMode(iDoc))) return;
    if (!initAccordionCheckedCounts(iDoc)) {
      if (++attemptsAcc < MAX_ATTEMPTS) setTimeout(tryInitAccordionCounts, POLL_INTERVAL_MS);
    }
  }

  function tryHighlightRuleset() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsRuleset < MAX_ATTEMPTS) setTimeout(tryHighlightRuleset, POLL_INTERVAL_MS);
      return;
    }
    if (getPageMode(doc) !== 'edit_ruleset') return;
    highlightIneffectiveRules(doc);
    highlightRuleMatchStatus(doc);
    addRulesetFilterToggle(doc);
  }

  function tryAddInventoryButtons() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsInventory < MAX_ATTEMPTS) setTimeout(tryAddInventoryButtons, POLL_INTERVAL_MS);
      return;
    }
    try { if (!/\/view\.py/.test(doc.location.pathname)) return; } catch (e) { return; }
    addInventoryButtons(doc);
  }

  // =========================================================================
  // FEATURE: Auto-check "Activate foreign changes" on changelog page
  // =========================================================================

  function tryAutoCheckForeignActivation() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsChangelog < MAX_ATTEMPTS) setTimeout(tryAutoCheckForeignActivation, POLL_INTERVAL_MS);
      return;
    }
    try { if (getPageMode(doc) !== 'changelog') return; } catch (e) { return; }
    const cb = doc.getElementById('cb_activate_p_foreign');
    if (!cb) {
      if (++attemptsChangelog < MAX_ATTEMPTS) setTimeout(tryAutoCheckForeignActivation, POLL_INTERVAL_MS);
      return;
    }
    if (!cb.checked) cb.click();
  }

  function tryAddViewWatoMenu() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsViewWato < MAX_ATTEMPTS) setTimeout(tryAddViewWatoMenu, POLL_INTERVAL_MS);
      return;
    }
    try { if (!/\/view\.py/.test(doc.location.pathname)) return; } catch (e) { return; }
    // Wait until the data table is present
    if (!doc.querySelector('tr.data td.nobr a[href*="host="]')) {
      if (++attemptsViewWato < MAX_ATTEMPTS) setTimeout(tryAddViewWatoMenu, POLL_INTERVAL_MS);
      return;
    }
    addViewWatoMenu(doc);
  }

  function tryAddWatoFolderMonitorButtons() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsFolderMon < MAX_ATTEMPTS) setTimeout(tryAddWatoFolderMonitorButtons, POLL_INTERVAL_MS);
      return;
    }
    try { if (!/\/wato\.py/.test(doc.location.pathname)) return; } catch (e) { return; }
    if (getPageMode(doc) !== 'folder') return;
    addWatoFolderMonitorButtons(doc);
  }

  // =========================================================================
  // Collapse All / Expand All buttons in the top menu bar.
  // Works on edit_host / bulkedit / editfolder (table.nform accordions)
  // and edit_ruleset (div.foldable accordions). Uses getTargetDoc() so it
  // works with and without the sidebar iframe.
  // =========================================================================

  function addAccordionToggleButtons(doc) {
    if (doc.body.dataset.cmkAccToggle === '1') return;
    try { if (!/\/wato\.py/.test(doc.location.pathname)) return; } catch (e) { return; }
    const menues = doc.querySelector('td.menues');
    if (!menues) return;
    if (!doc.querySelector('table.nform') && !doc.querySelector('div.foldable')) return;

    injectStyles(doc, 'cmk-sk-acc-toggle-style', `
      #cmk-sk-acc-toggle-btns {
        display: inline-flex; align-items: center; gap: 4px;
        margin-left: 10px; padding-left: 10px;
        border-left: 1px solid rgba(255,255,255,0.2);
        vertical-align: middle;
      }
      .cmk-sk-acc-btn {
        background: transparent; border-radius: 3px;
        padding: 2px 6px; font-size: 11px; font-family: monospace;
        font-weight: bold; cursor: pointer; white-space: nowrap; letter-spacing: 0.03em;
      }
      .cmk-sk-acc-btn.collapse { color: #e67e22; border: 1px solid #e67e22; }
      .cmk-sk-acc-btn.collapse:hover { background: rgba(230,126,34,0.15); }
      .cmk-sk-acc-btn.expand   { color: #27ae60; border: 1px solid #27ae60; }
      .cmk-sk-acc-btn.expand:hover   { background: rgba(39,174,96,0.15); }
    `);

    const wrap = doc.createElement('div');
    wrap.id = 'cmk-sk-acc-toggle-btns';

    const collapseBtn = doc.createElement('button');
    collapseBtn.className = 'cmk-sk-acc-btn collapse';
    collapseBtn.textContent = 'Collapse All';
    collapseBtn.addEventListener('click', () => {
      doc.querySelectorAll('table.nform.open thead tr.heading td[onclick]').forEach(td => td.click());
      doc.querySelectorAll('div.foldable.open div.foldable_header[onclick]').forEach(h => h.click());
    });

    const expandBtn = doc.createElement('button');
    expandBtn.className = 'cmk-sk-acc-btn expand';
    expandBtn.textContent = 'Expand All';
    expandBtn.addEventListener('click', () => {
      doc.querySelectorAll('table.nform.closed thead tr.heading td[onclick]').forEach(td => td.click());
      doc.querySelectorAll('div.foldable.closed div.foldable_header[onclick]').forEach(h => h.click());
    });

    wrap.appendChild(collapseBtn);
    wrap.appendChild(expandBtn);
    menues.appendChild(wrap);
    doc.body.dataset.cmkAccToggle = '1';
  }

  function tryAddAccordionToggleButtons() {
    const doc = getTargetDoc();
    if (!doc || !doc.body) {
      if (++attemptsAccToggle < MAX_ATTEMPTS) setTimeout(tryAddAccordionToggleButtons, POLL_INTERVAL_MS);
      return;
    }
    addAccordionToggleButtons(doc);
  }

  function init() {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    const mode = getPageMode(iDoc);
    const targetDoc = getTargetDoc();
    const targetMode = getPageMode(targetDoc);
    attemptsFolder    = 0;
    attemptsAcc       = 0;
    attemptsRuleset   = 0;
    attemptsInventory = 0;
    attemptsFolderMon = 0;
    attemptsViewWato  = 0;
    attemptsChangelog = 0;
    attemptsAccToggle = 0;
    attemptsSitesFilter = 0;
    // Folder select: self-stops if element not found, always schedules.
    setTimeout(tryEnhanceFolderSelect, 800);
    // Accordion: only on pages in ACCORDION_MODES.
    if (!mode || ACCORDION_MODES.has(mode)) {
      setTimeout(tryInitAccordionCounts, 800);
    }
    // Ruleset enhancements (ineffective + match status): only on edit_ruleset.
    if (!targetMode || targetMode === 'edit_ruleset') {
      setTimeout(tryHighlightRuleset, 300);
    }
    // Collapse/Expand All: on pages with nform or foldable accordions.
    setTimeout(tryAddAccordionToggleButtons, 600);
    // Inventory button: on view.py, self-stops if not applicable.
    setTimeout(tryAddInventoryButtons, 500);
    // Monitor button: on wato.py mode=folder, self-stops if not applicable.
    setTimeout(tryAddWatoFolderMonitorButtons, 500);
    // WATO menu: on view.py with host rows, self-stops if not applicable.
    setTimeout(tryAddViewWatoMenu, 800);
    // Auto-check foreign activation: only on mode=changelog.
    if (!targetMode || targetMode === 'changelog') setTimeout(tryAutoCheckForeignActivation, 500);
    // Sites status filters: only on mode=sites, self-stops if not applicable.
    if (!targetMode || targetMode === 'sites') setTimeout(tryAddSitesFilterBar, 500);
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

  // Detect SPA navigation (page change without full reload)
  new MutationObserver(() => {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    if (!iDoc) return;
    const mode = getPageMode(iDoc);
    const sel = iDoc.getElementById(FOLDER_SELECT_ID);
    if (sel && sel.classList.contains('select2-hidden-accessible') && !sel.dataset.cmkEnhanced) {
      attemptsFolder = 0;
      setTimeout(tryEnhanceFolderSelect, 300);
    }
    const selVF = iDoc.getElementById('wato_folder');
    if (selVF && selVF.classList.contains('select2-hidden-accessible') && !selVF.dataset.cmkEnhanced) {
      attemptsFolder = 0;
      setTimeout(tryEnhanceFolderSelect, 300);
    }
    if (ACCORDION_MODES.has(mode)) {
      const form = iDoc.getElementById('form_edit_host');
      if (form && !form.dataset.cmkAccBadge) {
        attemptsAcc = 0;
        setTimeout(tryInitAccordionCounts, 300);
      }
    }
    if (mode === 'edit_ruleset' && iDoc.body &&
        (!iDoc.body.dataset.cmkIneffHighlight || !iDoc.body.dataset.cmkMatchHighlight)) {
      attemptsRuleset = 0;
      setTimeout(tryHighlightRuleset, 300);
    }
    if (mode === 'folder' && iDoc.body && !iDoc.body.dataset.cmkFolderMonBtns) {
      attemptsFolderMon = 0;
      setTimeout(tryAddWatoFolderMonitorButtons, 300);
    }
    const tDoc = getTargetDoc();
    if (tDoc && tDoc.body && !tDoc.body.dataset.cmkViewWatoMenu) {
      try {
        if (/\/view\.py/.test(tDoc.location.pathname) && tDoc.querySelector('tr.data td.nobr a[href*="host="]')) {
          attemptsViewWato = 0;
          setTimeout(tryAddViewWatoMenu, 300);
        }
      } catch (e) {}
    }
    if (tDoc && tDoc.body && !tDoc.body.dataset.cmkAccToggle) {
      attemptsAccToggle = 0;
      setTimeout(tryAddAccordionToggleButtons, 300);
    }
    if (mode === 'sites' && iDoc.body && !iDoc.body.dataset.cmkSitesFilter) {
      attemptsSitesFilter = 0;
      setTimeout(tryAddSitesFilterBar, 300);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Restart on iframe load (sidebar layout)
  const mainIframe = document.querySelector('iframe[name="main"], iframe#main');
  if (mainIframe) {
    mainIframe.addEventListener('load', init);
  }

})();
