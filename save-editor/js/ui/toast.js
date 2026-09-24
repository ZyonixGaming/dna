(function (global) {
    'use strict';
    function ensureStack() {
        let stack = document.getElementById('toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toast-stack';
            document.body.appendChild(stack);
        }
        return stack;
    }
    function toast(message, kind, ms) {
        kind = kind || 'info';
        const stack = ensureStack();
        const el = document.createElement('div');
        el.className = 'toast ' + kind;
        el.textContent = message;
        el.addEventListener('click', () => el.remove());
        stack.appendChild(el);
        const timeout = ms === 0 ? null : setTimeout(() => el.remove(), ms || 4000);
        return () => { if (timeout) clearTimeout(timeout); el.remove(); };
    }
    global.Toast = { toast };
})(typeof window !== 'undefined' ? window : globalThis);
