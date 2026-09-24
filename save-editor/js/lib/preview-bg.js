(function (root) {
    'use strict';
    const $ = x => (typeof x === 'string' ? document.querySelector(x) : x);
    const COLORS = [
        { value: '#8000ff', title: 'Purple (default)' },
        { value: '#a522b4', title: 'Magenta' },
        { value: '#82d7ff', title: 'Game blue' },
        { value: '#777777', title: 'Grey' },
        { value: '#ffffff', title: 'White' },
        { value: '#1a1a1c', title: 'Dark' },
        { value: '#000000', title: 'Black' },
        { value: '#00b140', title: 'Green screen' }
    ];
    let styled = false;
    function injectStyle() {
        if (styled) return;
        styled = true;
        const css = `
.preview-bg-bar { display: flex; flex-wrap: wrap; gap: 4px; height: 20px; overflow: hidden;
    align-items: center; justify-content: center; margin-top: 6px; }
.preview-bg-bar .bg-swatch { width: 20px; height: 20px; flex: 0 0 20px; padding: 0; margin: 0;
    border: 2px solid #475569; border-radius: 4px; cursor: pointer; box-sizing: border-box; }
.preview-bg-bar .bg-swatch:hover { border-color: #94a3b8; }
.preview-bg-bar .bg-swatch.active { border-color: #48b5b5; box-shadow: 0 0 0 1px #48b5b5; }`;
        const el = document.createElement('style');
        el.textContent = css;
        document.head.appendChild(el);
    }
    function attach(opts) {
        const bar = $(opts.bar);
        const target = $(opts.target);
        if (!bar || !target) return null;
        injectStyle();
        const colors = opts.colors || COLORS;
        const dflt = opts.defaultValue || colors[0].value;
        let current = dflt;
        try {
            const saved = opts.storageKey && localStorage.getItem(opts.storageKey);
            if (saved && colors.some(c => c.value === saved)) current = saved;
        } catch (e) {   }
        bar.classList.add('preview-bg-bar');
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Preview background');
        bar.innerHTML = '';
        colors.forEach(c => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bg-swatch';
            b.dataset.bg = c.value;
            b.title = c.title + ' background';
            b.setAttribute('aria-label', c.title + ' background');
            b.style.background = c.value;
            b.addEventListener('click', () => set(c.value, true));
            bar.appendChild(b);
        });
        function set(value, save) {
            current = value;
            target.style.background = value;
            bar.querySelectorAll('.bg-swatch').forEach(b => {
                const on = b.dataset.bg === value;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', on);
            });
            if (save && opts.storageKey) {
                try { localStorage.setItem(opts.storageKey, value); } catch (e) {}
            }
        }
        set(current, false);
        return { set: v => set(v, true), get: () => current };
    }
    root.PreviewBg = { attach, COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
