'use strict';
const HorsePreview = (function () {
    const BG_STORAGE_KEY = 'horsey_studio_preview_bg';
    function palette() {
        const lib = window.PreviewBg;
        const base = (lib && lib.COLORS) || [];
        return [{ value: '', title: 'Panel background (default)' }].concat(base);
    }
    const bgBars = [];
    let storageBound = false;
    function pruneBgBars() {
        for (let i = bgBars.length - 1; i >= 0; i--) {
            if (!bgBars[i].barEl || !bgBars[i].barEl.isConnected) bgBars.splice(i, 1);
        }
    }
    function ensureStorageSync() {
        if (storageBound) return;
        storageBound = true;
        window.addEventListener('storage', (e) => {
            if (e.key !== BG_STORAGE_KEY || e.newValue === null) return;
            pruneBgBars();
            for (const entry of bgBars) {
                if (entry.api.get() !== e.newValue) entry.api.set(e.newValue);
            }
        });
    }
    function attachBg(opts) {
        const lib = window.PreviewBg;
        if (!lib || typeof lib.attach !== 'function') return null;
        const barEl = (typeof opts.bar === 'string') ? document.querySelector(opts.bar) : opts.bar;
        const targetEl = (typeof opts.target === 'string') ? document.querySelector(opts.target) : opts.target;
        if (!barEl || !targetEl) return null;
        const api = lib.attach({
            bar: barEl,
            target: targetEl,
            storageKey: BG_STORAGE_KEY,
            colors: palette(),
            defaultValue: ''
        });
        if (!api) return null;
        pruneBgBars();
        const entry = { api, barEl };
        bgBars.push(entry);
        barEl.addEventListener('click', (e) => {
            if (!e.target.closest('.bg-swatch')) return;
            const value = api.get();
            pruneBgBars();
            for (const other of bgBars) {
                if (other !== entry && other.api.get() !== value) other.api.set(value);
            }
        });
        ensureStorageSync();
        return api;
    }
    function bytesToAlleles(bytes) {
        const len = bytes.length;
        const alleles = new Array(len);
        for (let i = 0; i < len; i++) {
            const b = bytes[i], lo = b % 8;
            alleles[i] = [lo - 1, (b - lo) / 8 - 1];
        }
        return alleles;
    }
    function drawInto(canvas, bytes) {
        const box = canvas.parentNode;
        const boxW = Math.max(40, box.clientWidth - 8), boxH = Math.max(40, box.clientHeight - 8);
        const HR = window.HorseRender;
        if (!HR) { canvas.width = canvas.height = 0; return; }
        try {
            const alleles = bytesToAlleles(bytes);
            const geno = new HR.Genome.Genotype(alleles);
            const hash = HR.Genome.hash(alleles);
            const pheno = HR.Phenotype.build(geno);
            const colors = HR.Colors.build(geno, hash);
            const rig = HR.Rig.build(pheno, colors, hash);
            const b = HR.Render.bounds(rig), U = HR.Render.UNIT;
            const w1 = Math.max(1, Math.ceil(b.w * U) + 2), h1 = Math.max(1, Math.ceil(b.h * U) + 2);
            const zoom = Math.max(1, Math.min(6, Math.floor(Math.min(boxW / w1, boxH / h1))));
            HR.Render.render(canvas, rig, pheno, colors, hash, { zoom, pad: 1 });
            canvas.style.width = canvas.width + 'px';
            canvas.style.height = canvas.height + 'px';
        } catch (err) {
            canvas.width = canvas.height = 0;
        }
    }
    function signature(bytes, box) {
        if (!bytes || !bytes.length) return null;
        let h = 2166136261;
        for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = (h * 16777619) >>> 0; }
        return h + ':' + bytes.length + ':' + genesRev + ':' + box.clientWidth + 'x' + box.clientHeight;
    }
    let genesRev = 0;
    let genesSubscribed = false;
    const mounts = [];
    function pruneMounts() {
        for (let i = mounts.length - 1; i >= 0; i--) {
            if (!mounts[i].canvas.isConnected) mounts.splice(i, 1);
        }
    }
    function ensureGenesSubscription() {
        if (genesSubscribed) return;
        const HD = window.HorseRender && window.HorseRender.HorseyData;
        if (!HD || typeof HD.onGenesChanged !== 'function') return;
        genesSubscribed = true;
        HD.onGenesChanged(() => {
            genesRev++;
            pruneMounts();
            for (const m of mounts) m.refresh();
        });
    }
    function mount(box, opts) {
        const target = (typeof box === 'string') ? document.querySelector(box) : box;
        const getBytes = (opts && opts.getBytes) || (() => null);
        if (!target) return { refresh() {} };
        target.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.className = 'hp-canvas';
        target.appendChild(canvas);
        let lastSig = null;
        function refresh() {
            let bytes = null;
            try { bytes = getBytes(); } catch (e) { bytes = null; }
            if (!bytes || !bytes.length) { canvas.width = canvas.height = 0; lastSig = null; return; }
            const sig = signature(bytes, target);
            if (sig !== null && sig === lastSig) return;
            lastSig = sig;
            drawInto(canvas, bytes);
        }
        pruneMounts();
        mounts.push({ refresh, canvas });
        ensureGenesSubscription();
        refresh();
        return { refresh };
    }
    function mountPanel(container, opts) {
        const host = (typeof container === 'string') ? document.querySelector(container) : container;
        if (!host) return { refresh() {} };
        const collapseKey = opts.collapseKey || 'horsey_studio_hp_preview_open';
        let open = true;
        try {
            const saved = localStorage.getItem(collapseKey);
            if (saved !== null) open = saved !== '0';
        } catch (e) {   }
        host.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'hp-panel';
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'hp-panel-head';
        const labelEl = document.createElement('span');
        labelEl.className = 'hp-panel-label';
        labelEl.textContent = opts.label || 'Preview';
        const chevron = document.createElement('span');
        chevron.className = 'hp-panel-chevron';
        head.appendChild(labelEl);
        head.appendChild(chevron);
        panel.appendChild(head);
        const body = document.createElement('div');
        body.className = 'hp-panel-body';
        const box = document.createElement('div');
        box.className = 'hp-box';
        const bgBar = document.createElement('div');
        bgBar.className = 'hp-bg';
        body.appendChild(box);
        body.appendChild(bgBar);
        panel.appendChild(body);
        host.appendChild(panel);
        const previewApi = mount(box, { getBytes: opts.getBytes });
        attachBg({ bar: bgBar, target: box });
        function applyOpenState(forceRefresh) {
            panel.classList.toggle('collapsed', !open);
            chevron.textContent = open ? '▾' : '▸';
            head.setAttribute('aria-expanded', String(open));
            if (open && forceRefresh) previewApi.refresh();
        }
        head.addEventListener('click', () => {
            open = !open;
            try { localStorage.setItem(collapseKey, open ? '1' : '0'); } catch (e) {   }
            applyOpenState(true);
        });
        applyOpenState(false);
        return { refresh: () => { if (open) previewApi.refresh(); } };
    }
    return { mount, mountPanel, attachBg, BG_STORAGE_KEY };
})();
