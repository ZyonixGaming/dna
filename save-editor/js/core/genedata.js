(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.GeneData = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const GENE_MAP_HEX = [
        "03041011072026396254",
        "0e0f122d5b8586c1c9d4d5d3d6",
        "081c2a2b1e1d313a3d3e5051d1",
        "0b0c0d1a1b293233343c42434f6ada",
        "22282e2c353b4852531479",
        "090a4445473f46bc",
        "0001020506494a4b4c4d4e",
        "15161718191f21d9",
        "2324252f27303637384041",
        "565758595a5c5d5e5f60c3",
        "61636465666768696b6e6f70c2",
        "6c6d7172737475bd76777a7b7c7d78",
        "7e7f80818283848788898a8bd8",
        "8c8d8e8f9091929394a5a6",
        "95969798999a9b9c9d9e9f",
        "a0a1a2a3a4a7a8a9aaabacadae",
        "afb0b1b2b3b4b5b6b7b8b9babbbebf",
        "c0c4c5c6c7c8cacbcccdce",
        "d71355cfd0d2dbe0e5eaef",
        "dcdddedfe1e2e3e4e6e7e8e9ebecedee"
    ];
    const GENE_MAP = GENE_MAP_HEX.map((line) => line.match(/.{1,2}/g).map((h) => parseInt(h, 16)));
    const HELIX_LENGTHS = GENE_MAP.map((row) => row.length);
    const GENE_COUNT = HELIX_LENGTHS.reduce((sum, n) => sum + n, 0);
    const HELIX_COUNT = GENE_MAP.length;
    const HELIX_MAP = new Array(GENE_COUNT);
    for (let h = 0; h < GENE_MAP.length; h++) {
        for (let p = 0; p < GENE_MAP[h].length; p++) HELIX_MAP[GENE_MAP[h][p]] = [h, p];
    }
    function precomputeValueMatrix(g, m) {
        const matrix = Array(4).fill().map(() => Array(4).fill(0));
        for (let idx1 = 0; idx1 < 4; idx1++) {
            for (let idx2 = idx1; idx2 < 4; idx2++) {
                const domVal = g[idx1], recVal = g[idx2];
                const value = m >= 100 ? domVal : Math.floor((domVal * m + recVal * (100 - m)) / 100);
                matrix[idx1][idx2] = value;
                if (idx2 > idx1) matrix[idx2][idx1] = value;
            }
        }
        return matrix;
    }
    function parseGenesXml(xmlText) {
        const genes = [];
        const geneRe = /<gene\b([^>]*)\/>/g;
        const attrRe = /(\w+)="([^"]*)"/g;
        let geneMatch, geneIndex = 0;
        while ((geneMatch = geneRe.exec(xmlText))) {
            const attrs = {};
            let attrMatch;
            attrRe.lastIndex = 0;
            while ((attrMatch = attrRe.exec(geneMatch[1]))) attrs[attrMatch[1]] = attrMatch[2];
            if (!attrs.name) continue;
            const hp = HELIX_MAP[geneIndex];
            if (!hp) throw new Error('genes.xml has more <gene> entries than GENE_MAP slots (' + GENE_COUNT + ')');
            const [h, p] = hp;
            const n = attrs.n || 'TGCA';
            const g = [0, 1, 2, 3].map((k) => parseInt(attrs['g' + k], 10) || 0);
            const m = parseInt(attrs.m, 10) || 100;
            genes.push({
                id: geneIndex, h, p, key: h + ':' + p, desc: attrs.name,
                n, priorityOrder: n.split(''), g, m,
                s: parseInt(attrs.s, 10) || 1,
                valueMatrix: precomputeValueMatrix(g, m)
            });
            geneIndex++;
        }
        if (genes.length !== GENE_COUNT) {
            throw new Error('genes.xml has ' + genes.length + ' <gene> entries, expected ' + GENE_COUNT);
        }
        return genes;
    }
    function buildGeneById(genes) { return new Map(genes.map((g) => [g.id, g])); }
    function buildGeneByDesc(genes) { return new Map(genes.map((g) => [g.desc, g])); }
    function buildArrayHp(genes) {
        const arrayHp = GENE_MAP.map((row) => new Array(row.length));
        for (const g of genes) arrayHp[g.h][g.p] = g;
        return arrayHp;
    }
    return {
        GENE_MAP, HELIX_LENGTHS, GENE_COUNT, HELIX_COUNT, HELIX_MAP,
        precomputeValueMatrix, parseGenesXml, buildGeneById, buildGeneByDesc, buildArrayHp
    };
});
