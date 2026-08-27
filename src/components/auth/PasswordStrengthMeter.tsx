import React, { useEffect, useState } from 'react'
import { validatePasswordStrength, type PasswordStrengthResult } from '../../utils/validation'

interface PasswordStrengthMeterProps {
    password: string
    showWhenEmpty?: boolean
}

const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password, showWhenEmpty = false }) => {
    const [strength, setStrength] = useState<PasswordStrengthResult | null>(null)

    useEffect(() => {
        if (!password) {
            if (showWhenEmpty) {
                setStrength({
                    score: 0,
                    feedback: ['Enter a password to see strength'],
                    crackTime: 'instant',
                    crackTimeDisplay: 'instant'
                })
            } else {
                setStrength(null)
            }
            return
        }

        const checkStrength = async () => {
            try {
                const result = await validatePasswordStrength(password)
                setStrength(result)
            } catch {
                setStrength({
                    score: 0,
                    feedback: ['Unable to check password strength'],
                    crackTime: 'instant',
                    crackTimeDisplay: 'instant'
                })
            }
        }

        const debounce = setTimeout(checkStrength, 300)
        return () => clearTimeout(debounce)
    }, [password, showWhenEmpty])

    // If no strength and not showing when empty, don't render
    if (!strength && !showWhenEmpty) {
        return null
    }

    // Default values for when strength might be null but showWhenEmpty is true
    const score = strength?.score ?? 0
    const colors = ['#dc3545', '#fd7e14', '#ffc107', '#20c997', '#198754']
    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
    const color = colors[score] || colors[0]
    const label = labels[score] || labels[0]
    const crackTimeDisplay = strength?.crackTimeDisplay ?? 'instant'
    const feedback = strength?.feedback ?? []

    return (
        <div className="password-strength-meter" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4} aria-label={`Password strength: ${label}`}>
            <div className="strength-bar">
                <div
                    className="strength-fill"
                    style={{
                        width: `${((score + 1) / 5) * 100}%`,
                        backgroundColor: color
                    }}
                />
            </div>
            <div className="strength-info">
                <span className="strength-label" style={{ color }}>{label}</span>
                <span className="strength-time">Crack time: {crackTimeDisplay}</span>
            </div>
            {feedback.length > 0 && (
                <ul className="strength-feedback">
                    {feedback.slice(0, 3).map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default PasswordStrengthMeter