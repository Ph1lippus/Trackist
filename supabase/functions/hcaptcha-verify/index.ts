import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json().catch(() => null)
        const token = body?.token

        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing captcha token' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const secretKey = Deno.env.get('HCAPTCHA_SECRET_KEY')
        
        if (!secretKey) {
            console.error('HCAPTCHA_SECRET_KEY not configured')
            return new Response(
                JSON.stringify({ success: false, error: 'Server configuration error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const formData = new URLSearchParams()
        formData.append('secret', secretKey)
        formData.append('response', token.trim())

        const remoteIp = req.headers.get('x-real_ip') || req.headers.get('cf_connecting_ip')
        if (remoteIp) {
            formData.append('remoteip', remoteIp)
        }

        const response = await fetch('https://hcaptcha.com/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        })

        const result = await response.json()

        console.log('hCaptcha siteverify status:', response.status)
        console.log('hCaptcha siteverify result:', JSON.stringify(result))

        if (!result.success) {
            console.error('hCaptcha verification failed:', result['error-codes'])
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Captcha verification failed',
                    'error-codes': result['error-codes'],
                    details: result
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ success: true, score: result.score }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('hCaptcha verify error:', error)
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
