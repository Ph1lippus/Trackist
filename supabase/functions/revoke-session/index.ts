import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

        const { session_id, revoke_all_others } = await req.json()

        if (revoke_all_others) {
            // Revoke all sessions except current
            const { data: sessions } = await supabase.auth.admin.listSessions(user.id)
            
            if (sessions) {
                const currentSessionId = authHeader.replace('Bearer ', '')
                const otherSessions = sessions.filter(s => s.access_token !== currentSessionId)
                
                for (const s of otherSessions) {
                    await supabase.auth.admin.signOut(user.id, s.id)
                }
                
                // Also update user_sessions table
                await supabase
                    .from('user_sessions')
                    .update({ revoked_at: new Date().toISOString() })
                    .eq('user_id', user.id)
                    .neq('session_id', currentSessionId)
            }

            return new Response(
                JSON.stringify({ success: true, revoked_count: otherSessions?.length || 0 }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!session_id) {
            return new Response(
                JSON.stringify({ error: 'Missing session_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Revoke specific session
        const { error } = await supabase.auth.admin.signOut(user.id, session_id)
        
        if (error) throw error

        // Update user_sessions table
        await supabase
            .from('user_sessions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('session_id', session_id)

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Revoke session error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})