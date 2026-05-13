// Mobile sidebar toggle logic
(function () {
    const toggleBtn = document.getElementById('mobileRightToggle');
    const rightSidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (!toggleBtn || !rightSidebar) return;

    function openSidebar() {
        rightSidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
    }

    function closeSidebar() {
        rightSidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (rightSidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // Auto‑close if window is resized back to desktop width
    window.addEventListener('resize', function () {
        if (window.innerWidth > 900) {
            rightSidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
        }
    });
})();