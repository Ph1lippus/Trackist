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

function hashIP(ip: string): string {
    // Simple hash for privacy
    let hash = 0
    for (let i = 0; i < ip.length; i++) {
        hash = ((hash << 5) - hash) + ip.charCodeAt(i)
        hash = hash & hash
    }
    return Math.abs(hash).toString(16)
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

        const { fingerprint, user_agent, session_id } = await req.json()

        if (!fingerprint || !user_agent) {
            return new Response(
                JSON.stringify({ error: 'Missing fingerprint or user_agent' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get client IP from headers
        const forwarded = req.headers.get('x-forwarded-for')
        const realIp = req.headers.get('x-real-ip')
        const clientIp = forwarded?.split(',')[0]?.trim() || realIp || 'unknown'
        const ipHash = hashIP(clientIp)

        // Parse user agent for device info
        const ua = user_agent
        let browser = 'Unknown'
        let os = 'Unknown'
        let device_type = 'Desktop'

        if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone') || ua.includes('iPad')) {
            device_type = 'Mobile'
        } else if (ua.includes('Tablet') || ua.includes('iPad')) {
            device_type = 'Tablet'
        }

        if (ua.includes('Firefox')) browser = 'Firefox'
        else if (ua.includes('Edg/')) browser = 'Edge'
        else if (ua.includes('Chrome') || ua.includes('CriOS')) browser = 'Chrome'
        else if (ua.includes('Safari')) browser = 'Safari'

        if (ua.includes('Windows')) os = 'Windows'
        else if (ua.includes('Mac OS X') || ua.includes('macOS')) os = 'macOS'
        else if (ua.includes('Linux')) os = 'Linux'
        else if (ua.includes('Android')) os = 'Android'
        else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

        const deviceInfo = { browser, os, device_type }

        // Try to get location from IP (would need GeoIP service in production)
        let location = 'Unknown'
        // In production, integrate with a GeoIP service here

        // Check if this session already exists
        const { data: existing } = await supabase
            .from('user_sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('session_id', session_id)
            .single()

        if (existing) {
            // Update last_active
            await supabase
                .from('user_sessions')
                .update({ last_active: new Date().toISOString() })
                .eq('id', existing.id)
        } else {
            // Create new session record
            await supabase
                .from('user_sessions')
                .insert({
                    user_id: user.id,
                    session_id,
                    device_info: deviceInfo,
                    ip_hash: ipHash,
                    location,
                    created_at: new Date().toISOString(),
                    last_active: new Date().toISOString()
                })
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                fingerprint: hashIP(fingerprint),
                device_info: deviceInfo,
                location
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Device fingerprint error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})