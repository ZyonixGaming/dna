(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else global.History = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    function createHistory(onChange) {
        const undoStack = [];
        const redoStack = [];
        const notify = () => { if (onChange) onChange({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }); };
        return {
            push(command) {
                undoStack.push(command);
                redoStack.length = 0;
                notify();
            },
            undo() {
                const cmd = undoStack.pop();
                if (!cmd) return false;
                cmd.undo();
                redoStack.push(cmd);
                notify();
                return true;
            },
            redo() {
                const cmd = redoStack.pop();
                if (!cmd) return false;
                cmd.redo();
                undoStack.push(cmd);
                notify();
                return true;
            },
            clear() {
                undoStack.length = 0;
                redoStack.length = 0;
                notify();
            },
            entries() { return undoStack.map((c) => ({ label: c.label })); },
            redoEntries() { return redoStack.map((c) => ({ label: c.label })); },
            get canUndo() { return undoStack.length > 0; },
            get canRedo() { return redoStack.length > 0; },
            get editCount() { return undoStack.length; }
        };
    }
    return { createHistory };
});
