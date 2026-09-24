(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.Annotations = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const SIMPLE = {
        DERRIERE: { below: 13, suffix: 'hidden' },
        TEETH_SHAPE: { equals: 3, suffix: '🥩' },
        EAR_SIZE: { below: 13, suffix: 'deaf' }
    };
    const JOINT_NAMES = ['normal', 'rotate', 'piston'];
    const TAG_NAMES = ['nothing', 'leg', 'arm', 'tail', 'head'];
    function forCombo({ desc, value, pair }) {
        const pairStr = pair || '';
        if (desc === 'OSTO_SIZE') {
            return pairStr.includes('G') ? `${value} (rounded)` : `${value}`;
        }
        if (desc === 'CHEST_SMALL') {
            return pairStr.includes('A') ? `${value} (sloped)` : `${value}`;
        }
        if (desc.endsWith('_JOINT_TYPE')) {
            const name = JOINT_NAMES[value] !== undefined ? JOINT_NAMES[value] : value;
            return `${value} (${name})`;
        }
        if (desc.endsWith('_TAG')) {
            const name = TAG_NAMES[value] !== undefined ? TAG_NAMES[value] : value;
            return `${value} (${name})`;
        }
        const rule = SIMPLE[desc];
        if (rule) {
            if (rule.below !== undefined && value < rule.below) return `${value} (${rule.suffix})`;
            if (rule.equals !== undefined && value === rule.equals) return `${value} (${rule.suffix})`;
            return `${value}`;
        }
        return `${value}`;
    }
    return { forCombo };
});
