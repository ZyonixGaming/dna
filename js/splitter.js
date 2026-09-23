/* ======================================================================
   splitter.js - a draggable column divider. One global: window.Splitter.

     const s = Splitter.attach({
       handle,              // Element or selector: the divider the user drags
       container,           // Element or selector: whose edge the width is measured from
       cssVar,              // e.g. '--side-w', set on `container` as "<n>px"
       side: 'right',       // the resized column is on this side of the handle
       min: 320,            // smallest width (px)
       max: () => number,   // largest width (px); a number or a function, re-read on every move
       defaultWidth: 520,   // double-click resets to this
       storageKey,          // optional localStorage key (per-tool UI state, never synced)
       enabled: () => true  // optional; false = ignore input (e.g. a mobile layout)
     });
     s.set(px, save?)  s.get()  s.reset()  s.clamp()

   Drag it with the mouse or touch, or focus it and use arrow keys (Shift for
   bigger steps). Width is clamped on every change and on window resize.
   ====================================================================== */
(function (root) {
    'use strict';

    const $ = x => (typeof x === 'string' ? document.querySelector(x) : x);

    function attach(opts) {
        const handle = $(opts.handle);
        const container = $(opts.container);
        if (!handle || !container) return null;
        const side = opts.side === 'left' ? 'left' : 'right';
        const min = opts.min || 200;
        const dflt = opts.defaultWidth || min;
        const enabled = opts.enabled || (() => true);
        const maxOf = () => {
            const m = typeof opts.max === 'function' ? opts.max() : opts.max;
            return Math.max(min, isFinite(m) ? m : Infinity);
        };

        let width = dflt;
        try {
            const saved = opts.storageKey && parseInt(localStorage.getItem(opts.storageKey), 10);
            if (saved) width = saved;
        } catch (e) { /* storage blocked */ }

        function set(w, save) {
            width = Math.round(Math.min(Math.max(w, min), maxOf()));
            container.style.setProperty(opts.cssVar, width + 'px');
            handle.setAttribute('aria-valuenow', String(width));
            if (save && opts.storageKey) {
                try { localStorage.setItem(opts.storageKey, String(width)); } catch (e) {}
            }
        }

        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        if (!handle.hasAttribute('tabindex')) handle.tabIndex = 0;

        handle.addEventListener('pointerdown', e => {
            if (e.button !== 0 || !enabled()) return;
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);
            handle.classList.add('dragging');
            document.body.classList.add('resizing');
            const rect = container.getBoundingClientRect();
            // keep the grab point under the pointer instead of jumping to the handle's edge
            const hr = handle.getBoundingClientRect();
            const grab = side === 'right' ? e.clientX - hr.left : hr.right - e.clientX;
            const move = ev => set(side === 'right'
                ? rect.right - ev.clientX - (handle.offsetWidth - grab)
                : ev.clientX - rect.left - (handle.offsetWidth - grab), false);
            const up = () => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', up);
                handle.removeEventListener('pointercancel', up);
                handle.classList.remove('dragging');
                document.body.classList.remove('resizing');
                set(width, true);
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
            handle.addEventListener('pointercancel', up);
        });
        handle.addEventListener('dblclick', () => { if (enabled()) set(dflt, true); });
        handle.addEventListener('keydown', e => {
            if (!enabled()) return;
            const step = e.shiftKey ? 80 : 20;
            const grow = side === 'right' ? 'ArrowLeft' : 'ArrowRight';
            const shrink = side === 'right' ? 'ArrowRight' : 'ArrowLeft';
            if (e.key === grow) { set(width + step, true); e.preventDefault(); }
            else if (e.key === shrink) { set(width - step, true); e.preventDefault(); }
        });
        window.addEventListener('resize', () => set(width, false));
        set(width, false);

        return {
            set,
            get: () => width,
            reset: () => set(dflt, true),
            clamp: () => set(width, false)
        };
    }

    root.Splitter = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
