const supabaseUrl = 'https://iqlzdmjamsvxinqbrnix.supabase.co/rest/v1/';
const supabaseKey = 'sb_publishable_unnBNQ4MtAtOWxq7_bJU9w_mbeJwIKE';

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const loading = document.getElementById('loadingScreen');
if (loading) {
        setTimeout(function() {
            loading.style.opacity = '0';
            setTimeout(function() {
                loading.style.display = 'none';
            }, 600);
        }, 800);
}

const backBtn = document.getElementById('backToTop');
if (backBtn) { 
        backBtn.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
}


