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
        const { prefix } = await req.json()

        if (!prefix || prefix.length !== 5) {
            return new Response(
                JSON.stringify({ error: 'Invalid prefix. Must be 5 characters.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check cache first
        const cacheKey = `hibp:${prefix.toUpperCase()}`
        const { data: cached } = await supabase
            .from('kv_store')
            .select('value')
            .eq('key', cacheKey)
            .single()

        if (cached?.value) {
            return new Response(
                JSON.stringify(cached.value),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Query HIBP API
        const hibpUrl = `https://api.pwnedpasswords.com/range/${prefix.toUpperCase()}`
        const headers: Record<string, string> = {
            'User-Agent': 'Trackist/1.0',
            'Add-Padding': 'true'
        }
        
        const hibpApiKey = Deno.env.get('HIBP_API_KEY')
        if (hibpApiKey) {
            headers['hibp-api-key'] = hibpApiKey
        }

        const response = await fetch(hibpUrl, { headers })
        
        if (!response.ok) {
            throw new Error(`HIBP API error: ${response.status}`)
        }

        const text = await response.text()
        const lines = text.trim().split('\n')
        
        const results: Record<string, number> = {}
        let totalCount = 0
        
        for (const line of lines) {
            const [suffix, countStr] = line.split(':')
            if (suffix && countStr) {
                const count = parseInt(countStr, 10)
                results[(prefix + suffix).toLowerCase()] = count
                totalCount += count
            }
        }

        const result = {
            pwned: totalCount > 0,
            count: totalCount,
            hashes: results
        }

        // Cache for 24 hours
        await supabase
            .from('kv_store')
            .upsert({
                key: cacheKey,
                value: result,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }, { onConflict: 'key' })

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('HIBP check error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})