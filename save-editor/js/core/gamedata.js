'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./genedata.js'), require('./popdata.js'));
    } else {
        global.GameData = factory(global.GeneData, global.PopData);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (GeneData, PopData) {
    const CUSTOM_GENES_KEY = 'simpr_custom_genes_xml';
    const CUSTOM_POP_KEY = 'simpr_custom_pop_xml';
    const BUNDLED = { genes: 'data/genes.xml', pop: 'data/pop.xml' };
    let cache = null;
    let loading = null;
    const listeners = new Set();
    function store() {
        try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; }
        catch (e) {   }
        return null;
    }
    function readCustom(key) {
        const s = store();
        if (!s) return '';
        try { return s.getItem(key) || ''; } catch (e) { return ''; }
    }
    function fetchText(url) {
        if (typeof fetch === 'function' && typeof window !== 'undefined') {
            return fetch(url).then((r) => {
                if (!r.ok) throw new Error('Could not load ' + url + ' (HTTP ' + r.status + ')');
                return r.text();
            });
        }
        const fs = require('fs');
        const path = require('path');
        return Promise.resolve(fs.readFileSync(path.join(__dirname, '..', '..', url), 'utf8'));
    }
    function derive(genesXml, popXml) {
        const genes = GeneData.parseGenesXml(genesXml);
        if (!genes || !genes.length) throw new Error('genes.xml defined no genes.');
        const popTable = PopData.parsePopXml(popXml);
        if (!popTable || !popTable.size) throw new Error('pop.xml defined no populations.');
        return {
            genesXml, popXml, genes,
            geneTable: GeneData.buildGeneById(genes),
            geneByDesc: GeneData.buildGeneByDesc(genes),
            arrayHp: GeneData.buildArrayHp(genes),
            popTable,
            presetNames: [...popTable.keys()]
        };
    }
    function load(force) {
        if (cache && !force) return Promise.resolve(cache);
        if (loading && !force) return loading;
        const customGenes = readCustom(CUSTOM_GENES_KEY);
        const customPop = readCustom(CUSTOM_POP_KEY);
        loading = Promise.all([
            customGenes ? Promise.resolve(customGenes) : fetchText(BUNDLED.genes),
            customPop ? Promise.resolve(customPop) : fetchText(BUNDLED.pop)
        ]).then(([genesXml, popXml]) => {
            const warnings = [];
            let built;
            try {
                built = derive(genesXml, popXml);
                built.custom = { genes: !!customGenes, pop: !!customPop };
            } catch (e) {
                if (!customGenes && !customPop) throw e;
                warnings.push('The custom data could not be used (' + e.message + '); the bundled files are in use.');
                return Promise.all([fetchText(BUNDLED.genes), fetchText(BUNDLED.pop)])
                    .then(([g, p]) => {
                        const b = derive(g, p);
                        b.custom = { genes: false, pop: false };
                        b.warnings = warnings;
                        return b;
                    });
            }
            built.warnings = warnings;
            return built;
        }).then((built) => {
            syncRenderer(built);
            publishPopEnv(built);
            cache = built;
            loading = null;
            return cache;
        }).catch((e) => { loading = null; throw e; });
        return loading;
    }
    function syncRenderer(built) {
        const HR = typeof window !== 'undefined' ? window.HorseRender : null;
        const HD = HR && HR.HorseyData;
        if (!HD || typeof HD.applyGenes !== 'function') return;
        const res = HD.applyGenes(built.genes);
        if (res.ok) return;
        HD.resetGenes();
        built.warnings.push('The horse preview could not use this genes.xml (' + res.errors[0] +
            (res.errors.length > 1 ? ', +' + (res.errors.length - 1) + ' more' : '') +
            '); it is drawn with the built-in gene values.');
    }
    function publishPopEnv(built) {
        if (typeof window === 'undefined') return;
        const popData = {};
        for (const [name, genes] of built.popTable) popData[name] = genes;
        window.HorseyStudioPopEnv = {
            arrayHp: built.arrayHp,
            HELIX_LENGTHS: GeneData.HELIX_LENGTHS,
            defaultWeights: [1, 0, 0, 0],
            popData,
            popXmlText: built.popXml
        };
    }
    function get() { return cache; }
    function loaded() { return !!cache; }
    function setCustom(which, xml) {
        const key = which === 'pop' ? CUSTOM_POP_KEY : CUSTOM_GENES_KEY;
        const s = store();
        if (xml) {
            const other = which === 'pop' ? (readCustom(CUSTOM_GENES_KEY) || null) : (readCustom(CUSTOM_POP_KEY) || null);
            const pair = which === 'pop'
                ? [other, xml] : [xml, other];
            return Promise.all([
                pair[0] ? Promise.resolve(pair[0]) : fetchText(BUNDLED.genes),
                pair[1] ? Promise.resolve(pair[1]) : fetchText(BUNDLED.pop)
            ]).then(([g, p]) => {
                derive(g, p);
                if (s) s.setItem(key, xml);
                return load(true);
            }).then(notify);
        }
        if (s) { try { s.removeItem(key); } catch (e) {   } }
        return load(true).then(notify);
    }
    function clearCustom() {
        const s = store();
        if (s) {
            try { s.removeItem(CUSTOM_GENES_KEY); s.removeItem(CUSTOM_POP_KEY); }
            catch (e) {   }
        }
        return load(true).then(notify);
    }
    function notify(data) {
        for (const fn of listeners) {
            try { fn(data); } catch (e) {   }
        }
        return data;
    }
    function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    function status() {
        return {
            genes: !!readCustom(CUSTOM_GENES_KEY),
            pop: !!readCustom(CUSTOM_POP_KEY),
            genesBytes: readCustom(CUSTOM_GENES_KEY).length,
            popBytes: readCustom(CUSTOM_POP_KEY).length
        };
    }
    return {
        load, get, loaded, setCustom, clearCustom, onChange, status, derive,
        CUSTOM_GENES_KEY, CUSTOM_POP_KEY
    };
});
