import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hash, verify } from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function generateBackupCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { action, code } = await req.json()

        if (action === 'generate') {
            const plainCodes: string[] = []
            const storedCodes: Array<{ code: string; used: boolean; created_at: string }> = []
            
            for (let i = 0; i < 8; i++) {
                const plainCode = generateBackupCode()
                const hashedCode = await hash(plainCode)
                plainCodes.push(plainCode)
                storedCodes.push({
                    code: hashedCode,
                    used: false,
                    created_at: new Date().toISOString()
                })
            }

            const { error } = await supabase
                .from('user_mfa_backup_codes')
                .upsert({
                    user_id: user.id,
                    codes: storedCodes,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })

            if (error) throw error

            // Return the ACTUAL plain codes (ones whose hashes we stored), so
            // the user can use them later to log in. Returning freshly
            // regenerated random codes here would make the stored hashes
            // unusable (they'd never match).
            return new Response(
                JSON.stringify({
                    codes: plainCodes.map((c, i) => ({
                        code: c,
                        used: false,
                        created_at: storedCodes[i].created_at
                    }))
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (action === 'verify') {
            if (!code) {
                return new Response(
                    JSON.stringify({ error: 'Missing code' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data, error } = await supabase
                .from('user_mfa_backup_codes')
                .select('codes')
                .eq('user_id', user.id)
                .single()

            if (error || !data) {
                return new Response(
                    JSON.stringify({ valid: false }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const codes = data.codes as Array<{ code: string; used: boolean; created_at: string }>
            
            for (let i = 0; i < codes.length; i++) {
                if (!codes[i].used) {
                    const valid = await verify(code, codes[i].code)
                    if (valid) {
                        codes[i].used = true
                        
                        await supabase
                            .from('user_mfa_backup_codes')
                            .update({ codes, updated_at: new Date().toISOString() })
                            .eq('user_id', user.id)
                        
                        return new Response(
                            JSON.stringify({ valid: true }),
                            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        )
                    }
                }
            }

            return new Response(
                JSON.stringify({ valid: false }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (action === 'list') {
            const { data, error } = await supabase
                .from('user_mfa_backup_codes')
                .select('codes, updated_at')
                .eq('user_id', user.id)
                .single()

            if (error || !data) {
                return new Response(
                    JSON.stringify({ codes: [] }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const codes = data.codes as Array<{ code: string; used: boolean; created_at: string }>
            
            return new Response(
                JSON.stringify({ 
                    codes: codes.map(c => ({
                        used: c.used,
                        created_at: c.created_at
                    }))
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('MFA backup codes error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})