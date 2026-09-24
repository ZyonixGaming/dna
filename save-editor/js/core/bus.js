(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else global.Bus = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    function createBus() {
        const listeners = new Map();
        return {
            on(event, fn) {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event).add(fn);
                return () => listeners.get(event).delete(fn);
            },
            off(event, fn) {
                const s = listeners.get(event);
                if (s) s.delete(fn);
            },
            emit(event, payload) {
                const s = listeners.get(event);
                if (!s) return;
                for (const fn of [...s]) fn(payload);
            }
        };
    }
    return { createBus };
});
