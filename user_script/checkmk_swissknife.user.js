// ==UserScript==
// @name         Checkmk SwissKnife
// @namespace    https://luigidacunto.com/
// @version      2.3
// @description  Raccolta di miglioramenti all'interfaccia di Checkmk WATO. Ogni fix o enhancement viene aggiunto qui come feature indipendente.
// @author       Luigi D'Acunto
// @homepageURL  https://git.luigidacunto.com/tools/checkmk-swissknife
// @updateURL    https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js
// @downloadURL  https://luigidacunto.com/scripts/checkmk-swissknife/user_script/checkmk_swissknife.user.js
// @include      /^https?:\/\/.+\/check_mk\/(index|wato)\.py/
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
  // - Se c'è un iframe (index.py con sidebar) → usa il contentDocument dell'iframe
  // - Se wato.py è aperto direttamente → usa document solo se contiene la select target
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
  // in stile "Radice › Livello › Foglia" e abilitando la ricerca su di esso.
  // Si attiva solo quando la select #explicit_conditions_p_folder_path è presente.
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
      badge.textContent = `↑${count}`;
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

      updateAccordionBadge(td);
      updateInheritedBadge(td, iWin);

      tbody.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
          updateAccordionBadge(td);
          updateInheritedBadge(td, iWin);
        }
      });
    });

    form.dataset.cmkAccBadge = '1';
    return true;
  }


  // =========================================================================
  // BOOTSTRAP: polling per ogni feature, attivato solo se la select è presente
  // =========================================================================

  let attemptsFolder = 0;
  let attemptsAcc    = 0;

  function tryEnhanceFolderSelect() {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    if (!iDoc || !iDoc.body) {
      if (++attemptsFolder < MAX_ATTEMPTS) setTimeout(tryEnhanceFolderSelect, POLL_INTERVAL_MS);
      return;
    }

    const sel = iDoc.getElementById(FOLDER_SELECT_ID);
    if (!sel) {
      // La select non è presente in questa pagina: feature non applicabile, si ferma.
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
    // Guard URL: attiva solo sulla pagina edit_host
    if (getPageMode(iDoc) !== 'edit_host') return;
    if (!initAccordionCheckedCounts(iDoc)) {
      if (++attemptsAcc < MAX_ATTEMPTS) setTimeout(tryInitAccordionCounts, POLL_INTERVAL_MS);
    }
  }

  function init() {
    const iDoc = getWatoDoc(FOLDER_SELECT_ID);
    const mode = getPageMode(iDoc);
    attemptsFolder = 0;
    attemptsAcc    = 0;
    // Folder select: si auto-ferma se non trova l'elemento, schedula sempre.
    setTimeout(tryEnhanceFolderSelect, 800);
    // Accordion: solo su edit_host. Se mode è vuoto (iframe non ancora caricato)
    // si schedula comunque: tryInitAccordionCounts farà il guard URL.
    if (!mode || mode === 'edit_host') {
      setTimeout(tryInitAccordionCounts, 800);
    }
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
    if (mode === 'edit_host') {
      const form = iDoc.getElementById('form_edit_host');
      if (form && !form.dataset.cmkAccBadge) {
        attemptsAcc = 0;
        setTimeout(tryInitAccordionCounts, 300);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Riavvia al caricamento dell'iframe (layout con sidebar)
  const mainIframe = document.querySelector('iframe[name="main"], iframe#main');
  if (mainIframe) {
    mainIframe.addEventListener('load', init);
  }

})();
