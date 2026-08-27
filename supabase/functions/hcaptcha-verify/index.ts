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
        const { token } = await req.json()

        if (!token) {
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
        formData.append('response', token)

        const response = await fetch('https://hcaptcha.com/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        })

        const result = await response.json()

        if (!result.success) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Captcha verification failed',
                    'error-codes': result['error-codes']
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check score for enterprise features (score >= 0.5)
        const score = result.score
        if (typeof score === 'number' && score < 0.5) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Captcha score too low. Please try again.',
                    score 
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ success: true, score }),
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