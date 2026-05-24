// =====================================================================
//  Compact layout control (≤ 600 px)
//  Moves PASTE/COPY buttons and Helix nav into the main area,
//  then restores them when the window is wider again.
// =====================================================================

(function() {
    const COMPACT_MAX = 600;
    let compactActive = false;

    // ----- Elements we’ll move -----
    const pasteBtn = document.getElementById('pasteBtn');
    const exportBtn = document.getElementById('exportBtn');
    const helixNavContainer = document.getElementById('helixNavButtons');

    // Original parent containers (to move back later)
    const pasteExportParent = pasteBtn && pasteBtn.parentNode;   // the .btn-group
    const helixParent = helixNavContainer && helixNavContainer.parentNode; // the .helix-nav

    // We'll store a temporary container in the main area
    let topBar = null;

    // ----- Create / destroy the top bar and its contents -----
    function enterCompact() {
        if (compactActive) return;

        // Ensure main content exists
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        // Create the top bar if it doesn’t exist
        if (!topBar) {
            topBar = document.createElement('div');
            topBar.id = 'compactTopBar';
            mainContent.insertBefore(topBar, mainContent.firstChild);
        }

        // Move PASTE and COPY buttons
        if (pasteBtn && exportBtn) {
            topBar.appendChild(pasteBtn);
            topBar.appendChild(exportBtn);
        }

		// Build helix dropdown
		if (helixNavContainer) {
			// Gather unique helixes from window.allEntries (populated by genes.js)
			let helixes = [];
			if (window.allEntries) {
				helixes = [...new Set(window.allEntries.map(e => e.h))].sort((a, b) => a - b);
			} else {
				helixes = Array.from({ length: 20 }, (_, i) => i); // fallback 0‑19
			}

			const select = document.createElement('select');
			select.id = 'helixDropdown';
			select.innerHTML = helixes.map(h => `<option value="${h}">Helix ${h}</option>`).join('');

			select.addEventListener('change', function() {
				const h = this.value;
				const row = document.querySelector(`tr[data-helix="${h}"]`);
				if (row) {
					row.scrollIntoView({ behavior: 'smooth', block: 'start' });
					highlightHelixRows(h);
				}
			});

			topBar.appendChild(select);
			helixNavContainer.style.display = 'none';   // hide the button‑based nav
		}

        // Hide the whole left sidebar (CSS also does this, but just in case)
        document.querySelector('.left-sidebar').style.display = 'none';

        compactActive = true;
        window.compactModeActive = true;

        // Re‑render table to update header texts (H, P)
        if (window.renderTable) window.renderTable();
    }

    function exitCompact() {
        if (!compactActive) return;

        // Put buttons back
        if (pasteBtn && exportBtn && pasteExportParent) {
            pasteExportParent.appendChild(pasteBtn);
            pasteExportParent.appendChild(exportBtn);
        }

        // Remove the helix dropdown
        const dropdown = document.getElementById('helixDropdown');
        if (dropdown) dropdown.remove();

        // Remove the top bar (empty it)
        if (topBar) {
            topBar.remove();
            topBar = null;
        }

        // Show helix nav again
        if (helixNavContainer) {
            helixNavContainer.style.display = '';
        }

        // Show left sidebar
        document.querySelector('.left-sidebar').style.display = '';

        compactActive = false;
        window.compactModeActive = false;

        // Re‑render table to restore full headers
        if (window.renderTable) window.renderTable();
    }

    // ----- Listen for changes using matchMedia -----
    const mql = window.matchMedia(`(max-width: ${COMPACT_MAX}px)`);

    function handleChange(e) {
        if (e.matches) {
            enterCompact();
        } else {
            exitCompact();
        }
    }

    // Initial check
    mql.addEventListener('change', handleChange);
    // Fire once on load
    if (mql.matches) {
        // DOM may not be ready if script runs early, so use a small delay or defer
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => handleChange(mql));
        } else {
            handleChange(mql);
        }
    }

    // ----- Override renderTable to shorten headers when compact -----
    // (We must override the already‑overridden renderTable.)
    const _prevRender = window.renderTable;
    window.renderTable = function() {
        _prevRender.apply(this, arguments);
        if (window.compactModeActive) {
            const ths = document.querySelectorAll('#dynamicThead th');
            // Expected order: ⭐, Helix, Pair, Description, Combination
            if (ths.length >= 5) {
                ths[1].textContent = 'H';
                ths[2].textContent = 'P';
            }
        }
    };

})();