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

function calculateRiskScore(eventType: string, metadata: Record<string, unknown>): number {
    const baseScores: Record<string, number> = {
        login_success: 10,
        login_failure: 30,
        mfa_enroll: 20,
        mfa_verify: 10,
        mfa_failure: 40,
        password_change: 30,
        password_reset_request: 25,
        session_revoke: 20,
        session_revoke_all: 35,
        backup_code_used: 50,
        register: 15,
        logout: 5,
        email_change: 40,
        suspicious_activity: 80
    }

    let score = baseScores[eventType] || 10

    // Increase score for suspicious patterns
    if (metadata.multiple_failures) score += 20
    if (metadata.new_device) score += 15
    if (metadata.impossible_travel) score += 50
    if (metadata.vpn_detected) score += 25
    if (metadata.tor_detected) score += 35

    return Math.min(100, score)
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { event_type, user_id, ip_hash, user_agent, metadata = {} } = await req.json()

        if (!event_type) {
            return new Response(
                JSON.stringify({ error: 'Missing event_type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get client IP from headers if not provided
        let finalIpHash = ip_hash
        if (!finalIpHash) {
            const forwarded = req.headers.get('x-forwarded-for')
            const realIp = req.headers.get('x-real-ip')
            const clientIp = forwarded?.split(',')[0]?.trim() || realIp || 'unknown'
            
            // Simple hash for privacy
            let hash = 0
            for (let i = 0; i < clientIp.length; i++) {
                hash = ((hash << 5) - hash) + clientIp.charCodeAt(i)
                hash = hash & hash
            }
            finalIpHash = Math.abs(hash).toString(16)
        }

        const riskScore = calculateRiskScore(event_type, metadata)

        const { error } = await supabase
            .from('auth_audit_log')
            .insert({
                user_id: user_id || null,
                event_type,
                ip_hash: finalIpHash,
                user_agent: user_agent || null,
                metadata,
                risk_score: riskScore,
                created_at: new Date().toISOString()
            })

        if (error) throw error

        return new Response(
            JSON.stringify({ success: true, risk_score: riskScore }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Audit log error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})