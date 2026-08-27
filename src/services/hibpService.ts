import { supabase } from './supabaseClient'

export interface HIBPResult {
    pwned: boolean
    count: number
    hashes?: Record<string, number>
}

interface HIBPResponse {
    pwned: boolean
    count: number
    hashes?: Record<string, number>
}

export async function checkPasswordBreach(password: string): Promise<HIBPResult> {
    if (!password || password.length < 8) {
        return { pwned: false, count: 0 }
    }

    try {
        // Create SHA-1 hash of password
        const encoder = new TextEncoder()
        const data = encoder.encode(password)
        const hashBuffer = await crypto.subtle.digest('SHA-1', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
        
        const prefix = hashHex.substring(0, 5)

        const { data: responseData, error } = await supabase.functions.invoke('hibp-check', {
            body: { prefix }
        })

        if (error) {
            console.warn('HIBP check failed:', error.message)
            return { pwned: false, count: 0 }
        }

        if (!responseData) {
            return { pwned: false, count: 0 }
        }

        // Parse response if it's a Uint8Array (raw response body)
        let hibpData: HIBPResponse
        if (responseData instanceof Uint8Array) {
            const text = new TextDecoder().decode(responseData)
            hibpData = JSON.parse(text) as HIBPResponse
        } else {
            hibpData = responseData as HIBPResponse
        }

        const pwned = hibpData.pwned === true
        const count = hibpData.count || 0

        // If pwned, check if our specific hash is in the results
        if (pwned && hibpData.hashes) {
            const fullHash = hashHex.toLowerCase()
            const found = hibpData.hashes[fullHash]
            return { pwned: !!found, count: found || count }
        }

        return { pwned, count }
    } catch (err) {
        console.warn('HIBP check error:', err)
        return { pwned: false, count: 0 }
    }
}

export function isHIBPEnabled(): boolean {
    return import.meta.env.VITE_HIBP_ENABLED === 'true'
}