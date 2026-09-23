/* =====================================================================
   custom-data.js -> window.CustomData
   ---------------------------------------------------------------------
   Reusable "Custom data" block: lets a tool load a modded genes.xml
   and/or pop.xml, cache them in localStorage, and reapply them on the
   next page load. Ported from tools/js/simpr-main.js (SIMPR's inline
   "PRESETS + CUSTOM DATA" section, ~lines 2279-2287 and 2619-2768).

   Classic browser script (IIFE, 'use strict'). Defines one global,
   window.CustomData. No ES modules, no bundler.

   Needs (all optional, used only if present -- see common-modules.md
   §1/§2/§4):
     - genes.js:  bare `loadGeneDataFromXml(xml)`, bare `genesXmlText`
     - pop.js:    bare `loadPopDataFromXml(xml)`, bare `popXmlText`
     - horse-render.js: window.HorseyData.{applyGenes, resetGenes,
       recordsFromXml} -- if present, a custom genes.xml is also fed to
       the renderer and can be rejected (layout/name mismatch); if
       absent, custom genes only affect genes.js's own table.

   Storage contract (shared with SIMPR and the integrated save editor;
   DO NOT rename these keys):
     simpr_custom_genes_xml  -> full text of a custom genes.xml
     simpr_custom_pop_xml    -> full text of a custom pop.xml
   Both are plain full-XML-text values, no JSON wrapper. Not broadcast
   across tabs; a `storage` listener only warns the other tabs to
   reload, matching common-modules.md §8 / §9.

   Public API
   ---------------------------------------------------------------------
   CustomData.KEYS                       -> { genes, pop } localStorage keys
   CustomData.readCached()               -> { genesXml, popXml } ('' if absent)
   CustomData.validateGenesXml(text)     -> { ok:true, count } | { ok:false, reason }
   CustomData.validatePopXml(text)       -> { ok:true, count } | { ok:false, reason }

   const cd = CustomData.create({
     genesInput, popInput, statusEl, resetBtn, headerEl, bodyEl,   // Element | selector string
     collapseKey = 'simpr_customdata_open',
     genesXmlUrl = './data/genes.xml', popXmlUrl = './data/pop.xml',
     onGenesChanged(xmlTextOrNull) {},   // may return a Promise; not called by init()
     onPopChanged(xmlTextOrNull) {},
     toast(msg, kind, ms) {}
   });
   await cd.init()   -> { genesXml, popXml, custom: { genes, pop }, warnings: [] }
   cd.genesXml()     -> current effective genes.xml text
   cd.popXml()       -> current effective pop.xml text
   cd.status()       -> { genes: bool, pop: bool }   (true = custom is active)
   cd.destroy()
   ===================================================================== */
(function (window) {
    'use strict';

    var KEYS = { genes: 'simpr_custom_genes_xml', pop: 'simpr_custom_pop_xml' };

    var EXPECTED_GENE_COUNT = 240;

    // -------------------------------------------------------------
    //  Static validation / cache readers (same rules as SIMPR)
    // -------------------------------------------------------------

    function parseXml(xmlText) {
        if (typeof DOMParser === 'undefined') return null;
        try {
            return new DOMParser().parseFromString(xmlText, 'application/xml');
        } catch (e) {
            return null;
        }
    }

    function validateGenesXml(xmlText) {
        var doc = parseXml(xmlText || '');
        if (!doc) return { ok: false, reason: 'not valid XML' };
        if (doc.querySelector('parsererror')) return { ok: false, reason: 'not valid XML' };
        var genes = doc.querySelectorAll('gene');
        if (!genes.length) return { ok: false, reason: 'no <gene> elements found' };
        if (genes.length !== EXPECTED_GENE_COUNT) {
            return {
                ok: false,
                reason: genes.length + ' genes, but this build\'s helix map is fixed at ' + EXPECTED_GENE_COUNT
            };
        }
        var missingName = 0;
        genes.forEach(function (g) { if (!g.getAttribute('name')) missingName++; });
        if (missingName) return { ok: false, reason: missingName + ' gene(s) have no name attribute' };
        return { ok: true, count: genes.length };
    }

    function validatePopXml(xmlText) {
        var doc = parseXml(xmlText || '');
        if (!doc) return { ok: false, reason: 'not valid XML' };
        if (doc.querySelector('parsererror')) return { ok: false, reason: 'not valid XML' };
        var pops = doc.querySelectorAll('pop');
        if (!pops.length) return { ok: false, reason: 'no <pop> elements found' };
        return { ok: true, count: pops.length };
    }

    function readCached() {
        var genesXml = '', popXml = '';
        try { genesXml = localStorage.getItem(KEYS.genes) || ''; } catch (e) {}
        try { popXml = localStorage.getItem(KEYS.pop) || ''; } catch (e) {}
        return { genesXml: genesXml, popXml: popXml };
    }

    // -------------------------------------------------------------
    //  Instance
    // -------------------------------------------------------------

    function resolveEl(x) {
        if (!x) return null;
        if (typeof x === 'string') return document.querySelector(x);
        return x;
    }

    function create(opts) {
        opts = opts || {};

        var genesInput = resolveEl(opts.genesInput);
        var popInput = resolveEl(opts.popInput);
        var statusEl = resolveEl(opts.statusEl);
        var resetBtn = resolveEl(opts.resetBtn);
        var headerEl = resolveEl(opts.headerEl);
        var bodyEl = resolveEl(opts.bodyEl);

        var collapseKey = opts.collapseKey || 'simpr_customdata_open';
        var genesXmlUrl = opts.genesXmlUrl || './data/genes.xml';
        var popXmlUrl = opts.popXmlUrl || './data/pop.xml';
        var onGenesChanged = typeof opts.onGenesChanged === 'function' ? opts.onGenesChanged : null;
        var onPopChanged = typeof opts.onPopChanged === 'function' ? opts.onPopChanged : null;
        var toast = typeof opts.toast === 'function' ? opts.toast : function () {};

        var genesXmlCurrent = '';
        var popXmlCurrent = '';
        var customGenesFlag = false;
        var customPopFlag = false;
        var storageToastShown = false;

        // ---- bare-global helpers (guarded) ----

        function callLoadGenes(xmlText) {
            if (typeof loadGeneDataFromXml === 'function') return loadGeneDataFromXml(xmlText);
            return undefined;
        }

        function callLoadPop(xmlText) {
            if (typeof loadPopDataFromXml === 'function') return loadPopDataFromXml(xmlText);
            return undefined;
        }

        function bundledGenesFallbackText() {
            return typeof genesXmlText !== 'undefined' ? genesXmlText : '';
        }

        function bundledPopFallbackText() {
            return typeof popXmlText !== 'undefined' ? popXmlText : '';
        }

        async function fetchBundled(url, fallbackText) {
            try {
                if (typeof fetch === 'function') {
                    var res = await fetch(url);
                    if (res && res.ok) {
                        var t = await res.text();
                        if (t) return t;
                    }
                }
            } catch (e) { /* fall through to the inlined copy */ }
            return fallbackText || '';
        }

        function hasHorseyData() {
            return !!(window.HorseyData && typeof window.HorseyData.applyGenes === 'function');
        }

        function applyToRenderer(xmlText) {
            // Assumes window.HorseyData exists; returns { ok, errors }.
            var records = window.HorseyData.recordsFromXml(xmlText);
            return window.HorseyData.applyGenes(records);
        }

        function cacheCustomXml(key, text) {
            try {
                localStorage.setItem(key, text);
                return true;
            } catch (e) {
                toast('Loaded, but too large to remember across reloads', 'warn', 4000);
                return false;
            }
        }

        // ---- status / collapse ----

        function renderStatus() {
            if (!statusEl) return;
            var parts = [];
            if (customGenesFlag) parts.push('custom genes.xml');
            if (customPopFlag) parts.push('custom pop.xml');
            if (!parts.length) {
                statusEl.className = 'custom-status';
                statusEl.textContent = 'Using bundled data.';
            } else {
                statusEl.className = 'custom-status active';
                statusEl.textContent = 'Active: ' + parts.join(' + ');
            }
        }

        function applyCollapse(open) {
            if (bodyEl) bodyEl.style.display = open ? '' : 'none';
            if (headerEl) headerEl.classList.toggle('collapsed', !open);
        }

        var collapseOpen = false;
        try { collapseOpen = localStorage.getItem(collapseKey) === '1'; } catch (e) {}
        applyCollapse(collapseOpen); // collapsed by default

        function onHeaderClick() {
            var nowOpen = !collapseOpen;
            try { nowOpen = localStorage.getItem(collapseKey) !== '1'; } catch (e) {}
            try { localStorage.setItem(collapseKey, nowOpen ? '1' : '0'); } catch (e) {}
            collapseOpen = nowOpen;
            applyCollapse(nowOpen);
        }
        if (headerEl) headerEl.addEventListener('click', onHeaderClick);

        // ---- init: load the effective genes/pop tables ----

        async function loadGenesTable(warnings) {
            var cached = readCached().genesXml;
            var text = '';
            var custom = false;

            if (cached) {
                var v = validateGenesXml(cached);
                if (v.ok) {
                    text = cached;
                    custom = true;
                } else {
                    warnings.push('Cached custom genes.xml is invalid (' + v.reason + '); using bundled data.');
                }
            }

            if (!text) {
                text = await fetchBundled(genesXmlUrl, bundledGenesFallbackText());
            }

            await callLoadGenes(text);

            if (hasHorseyData()) {
                if (custom) {
                    var res = applyToRenderer(text);
                    if (!res.ok) {
                        warnings.push(
                            'Cached custom genes.xml rejected by renderer (' +
                                ((res.errors && res.errors[0]) || 'unknown error') +
                                '); using bundled data.'
                        );
                        custom = false;
                        text = await fetchBundled(genesXmlUrl, bundledGenesFallbackText());
                        await callLoadGenes(text);
                        window.HorseyData.resetGenes();
                    }
                } else {
                    window.HorseyData.resetGenes();
                }
            }

            genesXmlCurrent = text;
            customGenesFlag = custom;
        }

        async function loadPopTable(warnings) {
            var cached = readCached().popXml;
            var text = '';
            var custom = false;

            if (cached) {
                var v = validatePopXml(cached);
                if (v.ok) {
                    text = cached;
                    custom = true;
                } else {
                    warnings.push('Cached custom pop.xml is invalid (' + v.reason + '); using bundled data.');
                }
            }

            if (!text) {
                text = await fetchBundled(popXmlUrl, bundledPopFallbackText());
            }

            await callLoadPop(text);

            popXmlCurrent = text;
            customPopFlag = custom;
        }

        async function init() {
            var warnings = [];
            await loadGenesTable(warnings);
            await loadPopTable(warnings);
            renderStatus();
            return {
                genesXml: genesXmlCurrent,
                popXml: popXmlCurrent,
                custom: { genes: customGenesFlag, pop: customPopFlag },
                warnings: warnings
            };
        }

        // ---- upload handlers ----

        async function onGenesFileChange(e) {
            var file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;

            var text = await file.text();
            var check = validateGenesXml(text);
            if (!check.ok) {
                toast('genes.xml rejected: ' + check.reason, 'warn', 5000);
                return;
            }

            if (hasHorseyData()) {
                var res = applyToRenderer(text);
                if (!res.ok) {
                    window.HorseyData.resetGenes();
                    toast(
                        'genes.xml rejected: ' + ((res.errors && res.errors[0]) || 'renderer refused the file'),
                        'warn',
                        5000
                    );
                    return;
                }
            }

            cacheCustomXml(KEYS.genes, text);
            await callLoadGenes(text);
            genesXmlCurrent = text;
            customGenesFlag = true;
            if (onGenesChanged) await onGenesChanged(text);
            renderStatus();
            toast('Loaded custom genes.xml (' + check.count + ' genes)');
        }

        async function onPopFileChange(e) {
            var file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;

            var text = await file.text();
            var check = validatePopXml(text);
            if (!check.ok) {
                toast('pop.xml rejected: ' + check.reason, 'warn', 5000);
                return;
            }

            cacheCustomXml(KEYS.pop, text);
            await callLoadPop(text);
            popXmlCurrent = text;
            customPopFlag = true;
            if (onPopChanged) await onPopChanged(text);
            renderStatus();
            toast('Loaded custom pop.xml (' + check.count + ' populations)');
        }

        async function onResetClick() {
            if (!customGenesFlag && !customPopFlag) {
                toast('Already using bundled data');
                return;
            }

            var hadGenes = customGenesFlag;

            try { localStorage.removeItem(KEYS.genes); } catch (e) {}
            try { localStorage.removeItem(KEYS.pop); } catch (e) {}

            if (hadGenes) {
                var bundledGenes = await fetchBundled(genesXmlUrl, bundledGenesFallbackText());
                await callLoadGenes(bundledGenes);
                if (hasHorseyData()) window.HorseyData.resetGenes();
                genesXmlCurrent = bundledGenes;
                customGenesFlag = false;
                if (onGenesChanged) await onGenesChanged(null);
            }

            var bundledPop = await fetchBundled(popXmlUrl, bundledPopFallbackText());
            await callLoadPop(bundledPop);
            popXmlCurrent = bundledPop;
            customPopFlag = false;
            if (onPopChanged) await onPopChanged(null);

            renderStatus();
            toast('Reverted to bundled genes.xml and pop.xml');
        }

        if (genesInput) genesInput.addEventListener('change', onGenesFileChange);
        if (popInput) popInput.addEventListener('change', onPopFileChange);
        if (resetBtn) resetBtn.addEventListener('click', onResetClick);

        // ---- cross-tab notice ----

        function onStorage(e) {
            if (e.key === KEYS.genes || e.key === KEYS.pop) {
                if (!storageToastShown) {
                    storageToastShown = true;
                    toast('Custom data changed in another tab — reload to apply', 'warn');
                }
            }
        }
        window.addEventListener('storage', onStorage);

        function destroy() {
            if (genesInput) genesInput.removeEventListener('change', onGenesFileChange);
            if (popInput) popInput.removeEventListener('change', onPopFileChange);
            if (resetBtn) resetBtn.removeEventListener('click', onResetClick);
            if (headerEl) headerEl.removeEventListener('click', onHeaderClick);
            window.removeEventListener('storage', onStorage);
        }

        return {
            init: init,
            genesXml: function () { return genesXmlCurrent; },
            popXml: function () { return popXmlCurrent; },
            status: function () { return { genes: customGenesFlag, pop: customPopFlag }; },
            destroy: destroy
        };
    }

    window.CustomData = {
        KEYS: KEYS,
        readCached: readCached,
        validateGenesXml: validateGenesXml,
        validatePopXml: validatePopXml,
        create: create
    };
})(window);
