if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    const loading = document.getElementById('loadingScreen');
    if (loading) {
        setTimeout(function() {
            loading.style.opacity = '0';
            setTimeout(function() {
                loading.style.display = 'none';
            }, 600);
        }, 800);
    }
}