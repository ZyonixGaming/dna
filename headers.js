// ====== BioHacker Tools Navigation Links ======
// Edit this file to add or remove tool links in the header dropdown.
// Each link needs: name, url, icon (emoji or text)

const HEADER_LINKS = [
    {
        name: 'CRISPR 2.0',
        url: 'https://zyonixgaming.github.io/crispr/',
        icon: '🧬'
    },
    {
        name: 'DNA Shortener',
        url: 'https://zyonixgaming.github.io/dna/',
        icon: '🔗'
    },
    {
        name: 'BioHacker Optimizer',
        url: 'https://zyonixgaming.github.io/crispr/biohack.html',
        icon: '🧪'
    },
    {
        name: 'Lost Horsey Finder',
        url: 'https://zyonixgaming.github.io/dna/lost.html',
        icon: '🔎'
    }
	
	
];

// Populate the dropdown menu
(function populateHeaderLinks() {
    const menu = document.getElementById('dropdownMenu');
    if (!menu) {
        console.warn('header-links.js: dropdownMenu element not found');
        return;
    }
    let html = '';
    HEADER_LINKS.forEach(link => {
        const isCurrent = link.url === window.location.pathname || link.url === window.location.href;
        html += `<a href="${link.url}" target="${isCurrent ? '_self' : '_blank'}" rel="noopener">
            <span class="tool-icon">${link.icon}</span> ${link.name}
        </a>`;
    });
    menu.innerHTML = html;
})();


        document.getElementById('toolsBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            const menu = document.getElementById('dropdownMenu');
            const btn = this;
            menu.classList.toggle('show');
            btn.classList.toggle('open');
        });

        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('toolsDropdown');
            const menu = document.getElementById('dropdownMenu');
            const btn = document.getElementById('toolsBtn');
            if (!dropdown.contains(e.target)) {
                menu.classList.remove('show');
                btn.classList.remove('open');
            }
        });