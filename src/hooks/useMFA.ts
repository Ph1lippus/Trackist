import { useState, useCallback } from 'react'
import mfaService, { type MFAFactor, type MFAEnrollResponse, type MFAChallengeResponse, type MFAVerifyResponse, type BackupCode } from '../services/mfaService'

interface UseMFAReturn {
    factors: MFAFactor[]
    loading: boolean
    error: string | null
    enroll: (factorType?: 'totp' | 'webauthn', friendlyName?: string) => Promise<MFAEnrollResponse | null>
    listFactors: () => Promise<void>
    challenge: (factorId: string) => Promise<MFAChallengeResponse | null>
    verify: (factorId: string, challengeId: string, code: string) => Promise<MFAVerifyResponse | null>
    unenroll: (factorId: string) => Promise<boolean>
    generateBackupCodes: () => Promise<BackupCode[]>
    verifyBackupCode: (code: string) => Promise<boolean>
    clearError: () => void
}

export function useMFA(): UseMFAReturn {
    const [factors, setFactors] = useState<MFAFactor[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const clearError = useCallback(() => setError(null), [])

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
        return null
    }, [])

    const listFactors = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await mfaService.listFactors()
            setFactors(data)
        } catch (err) {
            handleError(err)
        } finally {
            setLoading(false)
        }
    }, [handleError])

    const enroll = useCallback(async (factorType: 'totp' | 'webauthn' = 'totp', friendlyName: string = 'Authenticator App') => {
        setLoading(true)
        setError(null)
        try {
            const data = await mfaService.enroll(factorType, friendlyName)
            await listFactors()
            return data
        } catch (err) {
            return handleError(err)
        } finally {
            setLoading(false)
        }
    }, [handleError, listFactors])

    const challenge = useCallback(async (factorId: string) => {
        setLoading(true)
        setError(null)
        try {
            const data = await mfaService.challenge(factorId)
            return data
        } catch (err) {
            return handleError(err)
        } finally {
            setLoading(false)
        }
    }, [handleError])

    const verify = useCallback(async (factorId: string, challengeId: string, code: string) => {
        setLoading(true)
        setError(null)
        try {
            const data = await mfaService.verify(factorId, challengeId, code)
            await listFactors()
            return data
        } catch (err) {
            return handleError(err)
        } finally {
            setLoading(false)
        }
    }, [handleError, listFactors])

    const unenroll = useCallback(async (factorId: string) => {
        setLoading(true)
        setError(null)
        try {
            await mfaService.unenroll(factorId)
            await listFactors()
            return true
        } catch (err) {
            handleError(err)
            return false
        } finally {
            setLoading(false)
        }
    }, [handleError, listFactors])

    const generateBackupCodes = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await mfaService.generateBackupCodes()
            return data
        } catch (err) {
            handleError(err)
            return []
        } finally {
            setLoading(false)
        }
    }, [handleError])

    const verifyBackupCode = useCallback(async (code: string) => {
        setLoading(true)
        setError(null)
        try {
            const valid = await mfaService.verifyBackupCode(code)
            return valid
        } catch (err) {
            handleError(err)
            return false
        } finally {
            setLoading(false)
        }
    }, [handleError])

    return {
        factors,
        loading,
        error,
        enroll,
        listFactors,
        challenge,
        verify,
        unenroll,
        generateBackupCodes,
        verifyBackupCode,
        clearError
    }
}