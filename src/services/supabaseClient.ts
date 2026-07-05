import { 
    createClient 
} from '@supabase/supabase-js'

const supabaseUrl = 'https://iqlzdmjamsvxinqbrnix.supabase.co'
const supabaseKey = 'sb_publishable_unnBNQ4MtAtOWxq7_bJU9w_mbeJwIKE'

export const supabase = createClient(supabaseUrl, supabaseKey)