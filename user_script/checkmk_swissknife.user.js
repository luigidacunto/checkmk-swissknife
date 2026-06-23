// ==UserScript==
// @name         Checkmk SwissKnife
// @namespace    https://luigidacunto.com/
// @version      2.12.0
// @checkmk      2.3.x
// @description  Raccolta di miglioramenti all'interfaccia di Checkmk WATO. Ogni fix o enhancement viene aggiunto qui come feature indipendente.
// @author       Luigi D'Acunto
// @homepageURL  https://git.luigidacunto.com/tools/checkmk-swissknife
// @updateURL    https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js
// @downloadURL  https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js
// @include      /^https?:\/\/.+\/check_mk\/(index|wato|view)\.py/
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // =========================================================================
  // INFRASTRUTTURA COMUNE
  // =========================================================================

  const LOG_PREFIX = '[CMK-SK]';
  const POLL_INTERVAL_MS = 500;
  const MAX_ATTEMPTS     = 60;

  // Ricava il documento su cui operare:
  // - Se c'Ã¨ un iframe (index.py con sidebar) â†’ usa il contentDocument dell'iframe
  // - Se wato.py Ã¨ aperto direttamente â†’ usa document solo se contiene la select target
  function getWatoDoc(selectId) {
    const iframe = document.querySelector('iframe[name="main"], iframe#main');
    if (iframe) {
      try { return iframe.contentDocument; } catch (e) { return null; }
    }
    if (document.getElementById(selectId) ||
        document.querySelector('select[name*="folder_path"]')) {
      return document;
    }
    return null;
  }

  // Legge il parametro "mode" dall'URL del documento target senza accedere al DOM
  function getPageMode(iDoc) {
    try { return new URLSearchParams(iDoc.location.search).get('mode') || ''; }
    catch (e) { return ''; }
  }

  // Restituisce il documento su cui operare, gestendo sia il caso iframe (index.py con
  // sidebar) che il caso direct (wato.py aperto senza sidebar, nessun iframe presente).
  function getTargetDoc() {
    const iframe = document.querySelector('iframe[name="main"], iframe#main');
    if (iframe) { try { return iframe.contentDocument; } catch (e) { return null; } }
    return document;
  }

  // Pagine che supportano gli accordion badge (stessa struttura form_edit_host + table.nform)
  const ACCORDION_MODES = new Set(['edit_host', 'bulkedit']);

  // Inietta CSS nel documento target (una sola volta, deduplica per id)
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
  // Migliora la <select> del folder path in WATO mostrando il path completo
  // in stile "Radice â€º Livello â€º Foglia" e abilitando la ricerca su di esso.
  // Si attiva solo quando la select #explicit_conditions_p_folder_path Ã¨ presente.
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
    ).join(' â€º ');
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
      console.warn(LOG_PREFIX, 'Impossibile distruggere Select2:', e);
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
        console.warn(LOG_PREFIX, 'jQuery Select2 init fallita:', e);
      }
    }

    if (iWin.Select2) {
      try {
        new iWin.Select2(sel, config);
        injectFolderStyles(iDoc);
        return;
      } catch (e) {
        console.warn(LOG_PREFIX, 'Select2 standalone init fallita:', e);
      }
    }

    // Fallback: overlay di ricerca custom sopra il select2 nativo
    buildCustomSearchOverlay(iDoc, sel);
  }

  function buildCustomSearchOverlay(iDoc, sel) {
    const divContainer = iDoc.getElementById(FOLDER_DIV_ID);
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
    searchInput.placeholder = 'Cerca folder per nome o path... (es: veeam, dc1/veeam)';
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
      const filtered = term
        ? options.filter(o =>
            o.label.toLowerCase().includes(term) ||
            o.value.toLowerCase().includes(term) ||
            o.original.toLowerCase().includes(term)
          )
        : options;

      if (filtered.length === 0) {
        const noRes = iDoc.createElement('div');
        noRes.textContent = 'Nessun risultato';
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
        more.textContent = `... e altri ${filtered.length - 200} risultati. Raffina la ricerca.`;
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
  // Mostra nel titolo di ogni accordion della pagina edit_host il numero
  // di checkbox attive nel gruppo. Es: "Services - DB (1)".
  // Il contatore si aggiorna in tempo reale al cambio delle checkbox.
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
      badge.textContent = `â†‘${count}`;
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
      badge.textContent = `â‰ ${count}`;
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
  // Nelle pagine mode=edit_ruleset sostituisce l'icona poco visibile
  // "icon_hyphen.svg" (title="Ineffective rule") con un badge colorato
  // e aggiunge un bordo sinistro alla riga.
  // Funziona sia su wato.py diretto (no iframe) che dentro index.py (iframe).
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
      badge.textContent = 'âš  ineffective';
      img.replaceWith(badge);
    });

    doc.body.dataset.cmkIneffHighlight = '1';
  }


  // =========================================================================
  // FEATURE: Rule Match Status Highlight
  //
  // Nelle pagine mode=edit_ruleset aperte con contesto host/service (parametri
  // host= e service= nell'URL), evidenzia le righe che matchano (verde) e
  // attenua quelle che non matchano (grigio), sostituendo le icone poco
  // visibili icon_checkmark e icon_hyphen con badge colorati.
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
      badge.textContent = 'âœ“ match';
      img.replaceWith(badge);
    });

    noMatchImgs.forEach(img => {
      const row = img.closest('tr');
      if (!row) return;
      row.classList.add('cmk-sk-rule-nomatch');
      const badge = doc.createElement('span');
      badge.className = 'cmk-sk-nomatch-badge';
      badge.title = img.title;
      badge.textContent = 'âœ— no match';
      img.replaceWith(badge);
    });

    doc.body.dataset.cmkMatchHighlight = '1';
  }


  // =========================================================================
  // FEATURE: Ruleset Filter Toggle
  //
  // Dopo che le funzioni di highlight hanno marcato le righe rilevanti
  // (match, no-match, ineffective), aggiunge una barra in cima con un pulsante
  // per nascondere le righe e i folder senza alcuna rilevanza. Utile su
  // pagine con centinaia di regole dove quelle rilevanti sono poche.
  // =========================================================================

  function addRulesetFilterToggle(doc) {
    if (doc.body.dataset.cmkFilterToggle === '1') return;
    doc.body.dataset.cmkFilterToggle = '1';

    const RELEVANT_SEL = 'tr.cmk-sk-rule-match, tr.cmk-sk-rule-nomatch, tr.cmk-sk-ineffective';

    // Nessuna riga evidenziata = nessuna ricerca attiva, toggle inutile
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
    btn.textContent = 'Solo rilevanti';

    const info = doc.createElement('span');
    info.textContent = `${relevantCount} rilevanti Â· ${irrelevantRows} righe e ${irrelevantFolders} folder non rilevanti`;

    btn.addEventListener('click', () => {
      const isActive = doc.body.classList.toggle('cmk-sk-filter-active');
      btn.classList.toggle('active', isActive);
      btn.textContent = isActive ? 'Mostra tutto' : 'Solo rilevanti';
    });

    bar.appendChild(btn);
    bar.appendChild(info);

    const anchor = doc.querySelector('div.foldable_wrapper') || doc.querySelector('div.wato');
    if (anchor) anchor.before(bar);
  }


  // =========================================================================
  // FEATURE: Inventory Button su view.py
  //
  // Nelle pagine view.py (monitoring views), aggiunge un piccolo pulsante
  // accanto a ogni hostname nella colonna Host per aprire direttamente la
  // pagina di Service Discovery dell'host in una nuova tab.
  // =========================================================================

  function addInventoryButtons(doc) {
    if (doc.body.dataset.cmkInventoryBtns === '1') return;

    const hostCells = doc.querySelectorAll('table.data td.nobr');
    if (!hostCells.length) return;

    injectStyles(doc, 'cmk-sk-inv-btn-styles', `
      .cmk-sk-btn-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        margin-right: 4px;
        vertical-align: middle;
      }
      .cmk-sk-inv-btn, .cmk-sk-copy-btn, .cmk-sk-copy-short-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 16px !important;
        height: 16px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        opacity: 0.8;
        flex-shrink: 0;
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
      .cmk-sk-copy-btn {
        background: rgba(90,180,214,0.08) !important;
        color: #5ab4d6 !important;
        border: 1px solid #5ab4d6 !important;
      }
      .cmk-sk-copy-btn:hover { opacity: 1; background: rgba(90,180,214,0.18) !important; }
      .cmk-sk-copy-short-btn {
        background: rgba(160,120,200,0.08) !important;
        color: #a078c8 !important;
        border: 1px solid #a078c8 !important;
      }
      .cmk-sk-copy-short-btn:hover { opacity: 1; background: rgba(160,120,200,0.18) !important; }
      .cmk-sk-copy-btn.copied, .cmk-sk-copy-short-btn.copied {
        border-color: #4caf50 !important;
        color: #4caf50 !important;
        background: rgba(76,175,80,0.12) !important;
        opacity: 1;
      }
      .cmk-sk-btn-group svg { display: block; }
    `);

    const CLIP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    hostCells.forEach(td => {
      let hostname = null;
      for (const a of td.querySelectorAll('a[href*="host="]')) {
        const h = new URLSearchParams(a.getAttribute('href').split('?')[1] || '').get('host');
        if (h) { hostname = h; break; }
      }
      if (!hostname) return;
      const shortname = hostname.split('.')[0];

      const group = doc.createElement('span');
      group.className = 'cmk-sk-btn-group';

      const btn = doc.createElement('a');
      btn.className = 'cmk-sk-inv-btn';
      btn.href = `wato.py?host=${encodeURIComponent(hostname)}&mode=inventory`;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.title = `Service Discovery: ${hostname}`;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="6 9 9 12 14 7" stroke-width="2"/></svg>';

      const copyBtn = doc.createElement('button');
      copyBtn.className = 'cmk-sk-copy-btn';
      copyBtn.type = 'button';
      copyBtn.title = `Copia hostname: ${hostname}`;
      copyBtn.innerHTML = CLIP_SVG;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(hostname).then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 900);
        });
      });

      const copyShortBtn = doc.createElement('button');
      copyShortBtn.className = 'cmk-sk-copy-short-btn';
      copyShortBtn.type = 'button';
      copyShortBtn.title = `Copia hostname corto: ${shortname}`;
      copyShortBtn.innerHTML = CLIP_SVG;
      copyShortBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shortname).then(() => {
          copyShortBtn.classList.add('copied');
          setTimeout(() => copyShortBtn.classList.remove('copied'), 900);
        });
      });

      group.appendChild(btn);
      group.appendChild(copyBtn);
      group.appendChild(copyShortBtn);
      td.prepend(group);
    });

    doc.body.dataset.cmkInventoryBtns = '1';
  }


  // =========================================================================
  // FEATURE: Monitor Button su wato.py (mode=folder)
  //
  // Nelle pagine WATO folder, aggiunge un piccolo pulsante accanto all'hostname
  // di ogni host attivo (non disabilitato) per aprire la vista di monitoraggio
  // in una nuova tab. Il pulsante occupa lo spazio dove appare l'icona X per
  // gli host disabilitati, mantenendo l'allineamento delle colonne.
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
      // Hostname cell: contiene esattamente un link con mode=edit_host il cui testo Ã¨ l'hostname
      const links = td.querySelectorAll('a[href*="mode=edit_host"]');
      if (links.length !== 1) return;
      const link = links[0];
      const hostname = new URLSearchParams((link.getAttribute('href') || '').split('?')[1] || '').get('host');
      if (!hostname || link.textContent.trim() !== hostname) return;

      // Salta host disabilitati (hanno img con title="This host is disabled" nella stessa cella)
      if (td.querySelector('img[title="This host is disabled"]')) { disabled++; return; }

      // Evita doppio inserimento
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
      td.insertBefore(doc.createTextNode('Â '), link);
      active++;
    });

    if (added > 0) doc.body.dataset.cmkFolderMonBtns = '1';
  }


  // =========================================================================
  // BOOTSTRAP: polling per ogni feature, attivato solo se la select Ã¨ presente
  // =========================================================================

  let attemptsFolder    = 0;
  let attemptsAcc       = 0;
  let attemptsRuleset   = 0;
  let attemptsInventory = 0;
  let attemptsFolderMon = 0;

  function tryEnhanceFolderSelect() {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    if (!iDoc || !iDoc.body) {
      if (++attemptsFolder < MAX_ATTEMPTS) setTimeout(tryEnhanceFolderSelect, POLL_INTERVAL_MS);
      return;
    }

    const sel = iDoc.getElementById(FOLDER_SELECT_ID);
    if (!sel) {
      // La select non Ã¨ presente in questa pagina: feature non applicabile, si ferma.
      return;
    }

    if (!sel.classList.contains('select2-hidden-accessible')) {
      if (++attemptsFolder < MAX_ATTEMPTS) setTimeout(tryEnhanceFolderSelect, POLL_INTERVAL_MS);
      return;
    }

    buildCustomSearchOverlay(iDoc, sel);
  }

  function tryInitAccordionCounts() {
    const iDoc = getWatoDoc('form_edit_host');
    if (!iDoc || !iDoc.body) {
      if (++attemptsAcc < MAX_ATTEMPTS) setTimeout(tryInitAccordionCounts, POLL_INTERVAL_MS);
      return;
    }
    // Guard URL: attiva solo sulle pagine con accordion supportati
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
    // Folder select: si auto-ferma se non trova l'elemento, schedula sempre.
    setTimeout(tryEnhanceFolderSelect, 800);
    // Accordion: solo sulle pagine in ACCORDION_MODES.
    if (!mode || ACCORDION_MODES.has(mode)) {
      setTimeout(tryInitAccordionCounts, 800);
    }
    // Ruleset enhancements (ineffective + match status): solo su edit_ruleset.
    if (!targetMode || targetMode === 'edit_ruleset') {
      setTimeout(tryHighlightRuleset, 300);
    }
    // Inventory button: su view.py, si auto-ferma se non applicabile.
    setTimeout(tryAddInventoryButtons, 500);
    // Monitor button: su wato.py mode=folder, si auto-ferma se non applicabile.
    setTimeout(tryAddWatoFolderMonitorButtons, 500);
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

  // Rileva navigazione SPA (cambio regola senza reload di pagina)
  new MutationObserver(() => {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    if (!iDoc) return;
    const mode = getPageMode(iDoc);
    const sel = iDoc.getElementById(FOLDER_SELECT_ID);
    if (sel && sel.classList.contains('select2-hidden-accessible') && !sel.dataset.cmkEnhanced) {
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
  }).observe(document.body, { childList: true, subtree: true });

  // Riavvia al caricamento dell'iframe (layout con sidebar)
  const mainIframe = document.querySelector('iframe[name="main"], iframe#main');
  if (mainIframe) {
    mainIframe.addEventListener('load', init);
  }

})();

