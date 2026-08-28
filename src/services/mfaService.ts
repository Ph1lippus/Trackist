import { supabase } from './supabaseClient'

export interface MFAFactor {
    id: string
    factorType: 'totp' | 'webauthn'
    friendlyName: string
    status: 'unverified' | 'verified'
    createdAt: string
    updatedAt: string
}

export interface MFAEnrollResponse {
    id: string
    type: 'totp' | 'webauthn'
    totp?: {
        qrCode: string
        secret: string
        uri: string
    }
}

export interface MFAChallengeResponse {
    id: string
    factorId: string
    createdAt: string
    expiresAt: string
}

export interface MFAVerifyResponse {
    factorId: string
    factorType: 'totp' | 'webauthn'
    aal: 'aal1' | 'aal2'
}

export interface BackupCode {
    code: string
    used: boolean
    createdAt: string
}

const mfaService = {
    async enroll(factorType: 'totp' | 'webauthn' = 'totp', friendlyName: string = 'Authenticator App'): Promise<MFAEnrollResponse> {
        const { data, error } = await supabase.auth.mfa.enroll({
            factorType,
            friendlyName
        })
        
        if (error) throw error
        return data as unknown as MFAEnrollResponse
    },

    async listFactors(): Promise<MFAFactor[]> {
        const { data, error } = await supabase.auth.mfa.listFactors()
        
        if (error) throw error
        // Map Supabase factor types to our types (Supabase uses snake_case)
        return (data.all || []).map(f => ({
            id: f.id,
            factorType: f.factor_type as 'totp' | 'webauthn',
            friendlyName: f.friendly_name,
            status: f.status,
            createdAt: f.created_at,
            updatedAt: f.updated_at
        })) as MFAFactor[]
    },

    async challenge(factorId: string): Promise<MFAChallengeResponse> {
        const { data, error } = await supabase.auth.mfa.challenge({
            factorId
        })
        
        if (error) throw error
        return data as unknown as MFAChallengeResponse
    },

    async verify(factorId: string, challengeId: string, code: string): Promise<MFAVerifyResponse> {
        const { data, error } = await supabase.auth.mfa.verify({
            factorId,
            challengeId,
            code
        })
        
        if (error) throw error
        return data as unknown as MFAVerifyResponse
    },

    async unenroll(factorId: string): Promise<void> {
        const { error } = await supabase.auth.mfa.unenroll({
            factorId
        })
        
        if (error) throw error
    },

    async generateBackupCodes(): Promise<BackupCode[]> {
        const { data, error } = await supabase.functions.invoke('mfa-backup-codes', {
            body: { action: 'generate' }
        })
        
        if (error) throw error
        return (data as { codes?: BackupCode[] })?.codes || []
    },

    async verifyBackupCode(code: string): Promise<boolean> {
        const { data, error } = await supabase.functions.invoke('mfa-backup-codes', {
            body: { action: 'verify', code }
        })
        
        if (error) throw error
        return data?.valid === true
    },

    async getBackupCodes(): Promise<BackupCode[]> {
        const { data, error } = await supabase.functions.invoke('mfa-backup-codes', {
            body: { action: 'list' }
        })
        
        if (error) throw error
        return (data as { codes?: BackupCode[] })?.codes || []
    }
}

export default mfaService