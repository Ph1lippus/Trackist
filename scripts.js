const supabaseUrl = 'https://iqlzdmjamsvxinqbrnix.supabase.co';
const supabaseKey = 'sb_publishable_unnBNQ4MtAtOWxq7_bJU9w_mbeJwIKE';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const backBtn = document.getElementById('backToTop');
if (backBtn) {
    backBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}