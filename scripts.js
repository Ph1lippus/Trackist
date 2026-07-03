window.addEventListener('load', function() {
    const loading = document.getElementById('loadingScreen');
    setTimeout(function() {
        loading.style.opacity = '0';
        setTimeout(function() {
            loading.style.display = 'none';
        }, 800);
    }, 600);
});