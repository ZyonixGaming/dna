(function (global) {
    'use strict';
    function resolveEl(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        return target;
    }
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function debounce(fn, wait) {
        var timer = null;
        var wrapped = function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { timer = null; fn(); }, wait);
        };
        wrapped.cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
        return wrapped;
    }
    var requestIdle = global.requestIdleCallback
        ? function (cb) { return global.requestIdleCallback(cb, { timeout: 500 }); }
        : function (cb) { return setTimeout(cb, 60); };
    function env() { return global.HorseyStudioPopEnv || null; }
    function envPopData() { var e = env(); return (e && e.popData) || global.popData; }
    function getArrayHp() {
        if (env() && env().arrayHp) return env().arrayHp;
        return (typeof arrayHp !== 'undefined') ? arrayHp : null;
    }
    function getHelixLengths() {
        if (env() && env().HELIX_LENGTHS) return env().HELIX_LENGTHS;
        return (typeof HELIX_LENGTHS !== 'undefined') ? HELIX_LENGTHS : null;
    }
    function getDefaultWeights() {
        if (env() && env().defaultWeights) return env().defaultWeights;
        return (typeof defaultWeights !== 'undefined') ? defaultWeights : [1, 0, 0, 0];
    }
    function getPopXmlTextGlobal() {
        if (env() && typeof env().popXmlText === 'string' && env().popXmlText) return env().popXmlText;
        return (typeof popXmlText !== 'undefined' && typeof popXmlText === 'string') ? popXmlText : '';
    }
    function weightedRandom(weights) {
        var inverse = weights.map(function (w) { return (w === 0 ? 0 : 1 / w); });
        var sum = inverse.reduce(function (a, b) { return a + b; }, 0);
        if (sum === 0) return 0;
        var r = Math.random() * sum;
        for (var i = 0; i < inverse.length; i++) {
            r -= inverse[i];
            if (r <= 0) return i;
        }
        return inverse.length - 1;
    }
    function popWeightsFor(popName, gene) {
        var config = (envPopData() && envPopData()[popName]) || {};
        return config[gene.desc] || getDefaultWeights();
    }
    function makePopSampler(popName) {
        return function (gene) { return gene.n[weightedRandom(popWeightsFor(popName, gene))]; };
    }
    function buildGenomeText(sample) {
        var table = getArrayHp();
        var lengths = getHelixLengths();
        var lines = [];
        for (var h = 0; h < lengths.length; h++) {
            var strand1 = '';
            var strand2 = '';
            for (var p = 0; p < lengths[h]; p++) {
                var gene = table[h][p];
                strand1 += sample(gene);
                strand2 += sample(gene);
            }
            var hh = String(h).length < 2 ? '0' + h : String(h);
            lines.push(hh + ':' + strand1, hh + ':' + strand2);
        }
        return lines.join('\n');
    }
    function isBaseLegal(weights, gene, base) {
        var idx = gene.n.indexOf(base);
        return idx !== -1 && weights[idx] > 0;
    }
    function firstIllegalGene(popName, pairs) {
        var config = (envPopData() && envPopData()[popName]) || {};
        for (var i = 0; i < pairs.length; i++) {
            var gp = pairs[i];
            var listed = Object.prototype.hasOwnProperty.call(config, gp.desc);
            var weights = listed ? config[gp.desc] : getDefaultWeights();
            var bases = [gp.allele1, gp.allele2];
            for (var b = 0; b < bases.length; b++) {
                if (!isBaseLegal(weights, gp, bases[b])) {
                    return {
                        desc: gp.desc,
                        base: bases[b],
                        listed: listed,
                        lockedTo: listed ? null : gp.n[0]
                    };
                }
            }
        }
        return null;
    }
    function legalize(popName, pairs) {
        var config = (envPopData() && envPopData()[popName]) || {};
        var changed = 0;
        for (var i = 0; i < pairs.length; i++) {
            var gp = pairs[i];
            var listed = Object.prototype.hasOwnProperty.call(config, gp.desc);
            var weights = listed ? config[gp.desc] : getDefaultWeights();
            var legal = [0, 1, 2, 3].filter(function (idx) { return weights[idx] > 0; });
            if (!legal.length) continue;
            var preferred = legal.reduce(function (a, b) { return (weights[a] <= weights[b] ? a : b); });
            ['allele1', 'allele2'].forEach(function (side) {
                var idx = gp.n.indexOf(gp[side]);
                if (idx === -1 || weights[idx] === 0) {
                    gp[side] = gp.n[preferred];
                    changed++;
                }
            });
        }
        return changed;
    }
    function create(opts) {
        opts = opts || {};
        var listEl = resolveEl(opts.listEl);
        var filterInput = resolveEl(opts.filterInput);
        var filterClear = resolveEl(opts.filterClear);
        var headerEl = resolveEl(opts.headerEl);
        var bodyEl = resolveEl(opts.bodyEl);
        var collapseKey = opts.collapseKey || 'simpr_presets_open';
        var popXmlUrl = opts.popXmlUrl || './data/pop.xml';
        var loadGenome = typeof opts.loadGenome === 'function' ? opts.loadGenome : function () {};
        var onCompare = typeof opts.onCompare === 'function' ? opts.onCompare : null;
        var onOdds = typeof opts.onOdds === 'function' ? opts.onOdds : null;
        var isOddsActive = typeof opts.isOddsActive === 'function' ? opts.isOddsActive : function () { return false; };
        var getGenePairs = typeof opts.getGenePairs === 'function' ? opts.getGenePairs : null;
        var toast = typeof opts.toast === 'function' ? opts.toast : function (msg) { console.log(msg); };
        if (!listEl) throw new Error('PopPresets.create: listEl is required');
        var presetRows = [];
        var filterText = '';
        function getPresetRow(id) {
            for (var i = 0; i < presetRows.length; i++) if (presetRows[i].id === id) return presetRows[i];
            return null;
        }
        function generatePresetGenome(row) {
            if (!row) return null;
            var table = getArrayHp();
            if (!table || !table[0] || !table[0][0]) {
                toast('Gene data is still loading');
                return null;
            }
            return buildGenomeText(makePopSampler(row.popName));
        }
        function visibleRows() {
            if (!filterText) return presetRows;
            var needle = filterText.toLowerCase();
            return presetRows.filter(function (r) { return r.name.toLowerCase().indexOf(needle) !== -1; });
        }
        function render() {
            if (!presetRows.length) {
                listEl.innerHTML = '<div class="presets-empty">No presets loaded.</div>';
                return;
            }
            var rows = visibleRows();
            if (!rows.length) {
                listEl.innerHTML = '<div class="presets-empty">No population matches "'
                    + escapeHtml(filterText) + '".</div>';
                return;
            }
            listEl.innerHTML = rows.map(function (row) {
                var name = escapeHtml(row.name);
                var title = escapeHtml(row.title || row.name);
                var html = '<div class="preset-row" data-preset="' + escapeHtml(row.id) + '" title="' + title + '">'
                    + '<span class="preset-name">' + name + '</span>';
                if (onOdds) {
                    var active = isOddsActive(row.popName) ? ' active' : '';
                    html += '<button class="preset-odds' + active + '" data-act="odds" '
                        + 'title="Show the chance this population produces the pair each gene currently has. Press again to turn it off.">%</button>';
                }
                if (onCompare) {
                    html += '<button class="preset-compare" data-act="compare" title="Load into compare">⚖️</button>';
                }
                if (getGenePairs) {
                    html += '<span class="preset-dot" data-dot="' + escapeHtml(row.id) + '"></span>';
                }
                html += '</div>';
                return html;
            }).join('');
            if (getGenePairs) updateDots();
        }
        function updateDots() {
            var dots = listEl.querySelectorAll('.preset-dot[data-dot]');
            if (!dots.length) return;
            var pairs = getGenePairs();
            if (!pairs || !pairs.length) return;
            for (var i = 0; i < dots.length; i++) {
                var el = dots[i];
                var row = getPresetRow(el.getAttribute('data-dot'));
                if (!row) continue;
                var bad = firstIllegalGene(row.popName, pairs);
                el.classList.toggle('invalid', !!bad);
                el.textContent = bad ? '○' : '●';
                if (!bad) {
                    el.title = 'This genome can occur naturally in "' + row.name + '"';
                } else if (!bad.listed) {
                    el.title = 'Impossible in "' + row.name + '": ' + bad.desc + ' is not defined for this '
                        + 'population, so it is locked to ' + bad.lockedTo + ', but this genome has ' + bad.base + '. '
                        + 'Many genes are undefined even in "default", so hand-edited genomes usually fail here.';
                } else {
                    el.title = 'Impossible in "' + row.name + '": ' + bad.desc + ' cannot be ' + bad.base;
                }
            }
        }
        var scheduleDots = debounce(function () { requestIdle(updateDots); }, 120);
        function genomeChanged() {
            if (getGenePairs) scheduleDots();
        }
        function onFilterInput() {
            filterText = filterInput.value.trim();
            render();
        }
        function onFilterClear() {
            filterInput.value = '';
            filterText = '';
            render();
            filterInput.focus();
        }
        if (filterInput) filterInput.addEventListener('input', onFilterInput);
        if (filterClear) filterClear.addEventListener('click', onFilterClear);
        function onListClick(e) {
            var rowEl = e.target.closest ? e.target.closest('.preset-row') : null;
            if (!rowEl) return;
            var id = rowEl.getAttribute('data-preset');
            if (onOdds && e.target.closest('[data-act="odds"]')) {
                var row = getPresetRow(id);
                if (row) onOdds(row.popName);
                return;
            }
            if (onCompare && e.target.closest('[data-act="compare"]')) {
                var crow = getPresetRow(id);
                if (!crow) return;
                var text = generatePresetGenome(crow);
                if (text === null) return;
                onCompare(crow.name, text, crow);
                return;
            }
            if (e.target.closest && e.target.closest('.preset-dot')) return;
            var grow = getPresetRow(id);
            var gtext = generatePresetGenome(grow);
            if (gtext === null) return;
            loadGenome(gtext, grow);
            toast('Generated from ' + grow.name);
        }
        listEl.addEventListener('click', onListClick);
        function applyCollapse(open) {
            if (!headerEl || !bodyEl) return;
            bodyEl.style.display = open ? '' : 'none';
            headerEl.classList.toggle('collapsed', !open);
        }
        function onHeaderClick() {
            var nowOpen = localStorage.getItem(collapseKey) === '0';
            localStorage.setItem(collapseKey, nowOpen ? '1' : '0');
            applyCollapse(nowOpen);
        }
        if (headerEl && bodyEl) {
            applyCollapse(localStorage.getItem(collapseKey) !== '0');
            headerEl.addEventListener('click', onHeaderClick);
        }
        function buildRowsFromXml(xmlText) {
            var rows = [];
            var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
            if (doc.querySelector('parsererror')) {
                console.warn('pop.xml parse error');
                return rows;
            }
            doc.querySelectorAll('pop').forEach(function (node) {
                var name = node.getAttribute('name');
                if (!name) return;
                rows.push({
                    id: 'pop:' + name,
                    name: name,
                    popName: name,
                    title: 'Click to generate a "' + name + '" genome, or use the scales to compare against one'
                });
            });
            return rows;
        }
        function buildRowsFromPopData() {
            return Object.keys(envPopData() || {}).map(function (name) {
                return {
                    id: 'pop:' + name,
                    name: name,
                    popName: name,
                    title: 'Click to generate a "' + name + '" genome, or use the scales to compare against one'
                };
            });
        }
        async function fetchPopXmlText() {
            try {
                var res = await fetch(popXmlUrl);
                if (!res.ok) throw new Error('status ' + res.status);
                return await res.text();
            } catch (e) {
                return getPopXmlTextGlobal();
            }
        }
        async function reload(xmlText) {
            var text = (typeof xmlText === 'string' && xmlText) ? xmlText : await fetchPopXmlText();
            presetRows = text ? buildRowsFromXml(text) : [];
            if (!presetRows.length) presetRows = buildRowsFromPopData();
            render();
        }
        function destroy() {
            if (filterInput) filterInput.removeEventListener('input', onFilterInput);
            if (filterClear) filterClear.removeEventListener('click', onFilterClear);
            listEl.removeEventListener('click', onListClick);
            if (headerEl) headerEl.removeEventListener('click', onHeaderClick);
            scheduleDots.cancel();
            presetRows = [];
        }
        function getPresetRowByPopName(popName) {
            var found = null;
            for (var i = 0; i < presetRows.length; i++) {
                if (presetRows[i].popName === popName) { found = presetRows[i]; break; }
            }
            return found || { popName: popName, name: popName };
        }
        return {
            reload: reload,
            render: render,
            genomeChanged: genomeChanged,
            generate: function (popName) { return generatePresetGenome(getPresetRowByPopName(popName)); },
            firstIllegalGene: firstIllegalGene,
            legalize: legalize,
            getRows: function () { return presetRows.slice(); },
            destroy: destroy
        };
    }
    global.PopPresets = { create: create };
})(typeof window !== 'undefined' ? window : this);
