(function (global) {
    'use strict';
    function ensureBackdrop() {
        let backdrop = document.getElementById('modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'modal-backdrop';
            backdrop.className = 'modal-backdrop';
            document.body.appendChild(backdrop);
        }
        return backdrop;
    }
    function close(backdrop) {
        backdrop.classList.remove('show');
        backdrop.innerHTML = '';
    }
    function show(opts) {
        return new Promise((resolve) => {
            const backdrop = ensureBackdrop();
            const modal = document.createElement('div');
            modal.className = 'modal' + (opts.wide ? ' wide' : '');
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.textContent = opts.title || '';
            modal.appendChild(header);
            const body = document.createElement('div');
            body.className = 'modal-body';
            if (opts.body instanceof Node) body.appendChild(opts.body);
            else if (opts.body) body.textContent = opts.body;
            if (opts.errors && opts.errors.length) {
                const ul = document.createElement('ul');
                ul.style.color = 'var(--bad)';
                for (const e of opts.errors) { const li = document.createElement('li'); li.textContent = e; ul.appendChild(li); }
                body.appendChild(ul);
            }
            if (opts.warnings && opts.warnings.length) {
                const ul = document.createElement('ul');
                ul.style.color = 'var(--warn)';
                for (const w of opts.warnings) { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); }
                body.appendChild(ul);
            }
            modal.appendChild(body);
            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            const buttons = opts.buttons || [{ label: 'OK', primary: true, value: true }];
            for (const b of buttons) {
                const btn = document.createElement('button');
                btn.className = 'btn' + (b.primary ? ' primary' : '');
                btn.textContent = b.label;
                btn.disabled = !!b.disabled;
                btn.addEventListener('click', () => { close(backdrop); resolve(b.value); });
                footer.appendChild(btn);
            }
            modal.appendChild(footer);
            backdrop.innerHTML = '';
            backdrop.appendChild(modal);
            backdrop.classList.add('show');
            const onKey = (e) => {
                if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(backdrop); resolve(null); }
            };
            document.addEventListener('keydown', onKey);
            if (typeof opts.onOpen === 'function') {
                opts.onOpen({
                    resolve: (v) => { document.removeEventListener('keydown', onKey); close(backdrop); resolve(v); }
                });
            }
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) { document.removeEventListener('keydown', onKey); close(backdrop); resolve(null); }
            }, { once: true });
        });
    }
    function confirmModal(message, opts) {
        opts = opts || {};
        return show({
            title: opts.title || 'Confirm',
            body: message,
            buttons: [
                { label: opts.cancelLabel || 'Cancel', value: false },
                { label: opts.confirmLabel || 'OK', primary: true, value: true }
            ]
        }).then((v) => !!v);
    }
    function alertModal(message, title) {
        return show({ title: title || 'Notice', body: message, buttons: [{ label: 'OK', primary: true, value: true }] });
    }
    function promptModal(message, defaultValue, opts) {
        opts = opts || {};
        const wrap = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = message;
        label.style.display = 'block';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'modal-prompt-input';
        input.value = defaultValue == null ? '' : String(defaultValue);
        input.style.width = '100%';
        input.style.marginTop = '8px';
        label.appendChild(input);
        wrap.appendChild(label);
        return show({
            title: opts.title || 'Enter a value',
            body: wrap,
            buttons: [
                { label: opts.cancelLabel || 'Cancel', value: null },
                { label: opts.confirmLabel || 'OK', primary: true, value: 'ok' }
            ],
            onOpen: ({ resolve }) => {
                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); resolve('ok'); } });
                setTimeout(() => { input.focus(); input.select(); }, 0);
            }
        }).then((v) => (v === 'ok' ? input.value : null));
    }
    global.Modal = { show, confirmModal, alertModal, promptModal };
})(typeof window !== 'undefined' ? window : globalThis);
