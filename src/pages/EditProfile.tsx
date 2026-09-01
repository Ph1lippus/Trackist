import React, { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getProfile, updateProfile, uploadAvatar, checkDisplayNameExists } from '../services/profileService'
import { validateDisplayName } from '../utils/validation'
import type { User } from '@supabase/supabase-js'
import { useAuthStore } from '../stores/useAuthStore'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../utils/cropUtils'
import { usePageTitle } from '../hooks/usePageTitle'

interface Point {
    x: number
    y: number
}

const EditProfile: React.FC = () => {
    const navigate = useNavigate()
    usePageTitle('Track1st - Edit Profile')
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [username, setUsername] = useState('')
    const [bio, setBio] = useState('')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showCropper, setShowCropper] = useState(false)
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [rotation, setRotation] = useState(0)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [originalImage, setOriginalImage] = useState<string | null>(null)

    useEffect(() => {
        const loadUser = async () => {
            const user = useAuthStore.getState().user
            setCurrentUser(user)
            
            if (user) {
                const { data } = await getProfile(user.id)
                if (data) {
                    setUsername(data.display_name || '')
                    setBio(data.bio || '')
                    setAvatarUrl(data.avatar_url || null)
                }
            }
        }
        void loadUser()
    }, [])

    const handleAvatarClick = () => {
        fileInputRef.current?.click()
    }

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            // Validate file size (4MB max) - show error if too big
            if (file.size > 4 * 1024 * 1024) {
                setError('Image must be smaller than 4MB')
                return
            }
            
            const reader = new FileReader()
            reader.onload = (event) => {
                setOriginalImage(event.target?.result as string)
                setShowCropper(true)
            }
            reader.readAsDataURL(file)
        }
    }

    const onCropComplete = (_: unknown, croppedPixels: { x: number; y: number; width: number; height: number }) => {
        setCroppedAreaPixels(croppedPixels)
    }

    const handleCropSave = async () => {
        if (originalImage && croppedAreaPixels && currentUser) {
            try {
                const croppedImage = await getCroppedImg(originalImage, croppedAreaPixels, rotation)
                // Convert base64 to file
                const response = await fetch(croppedImage)
                const blob = await response.blob()
                const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
                
                const { url, error: uploadError } = await uploadAvatar(file)
                if (uploadError) {
                    setError(uploadError)
                    return
                }
                setAvatarUrl(url)
            } catch {
                setError('Failed to process image')
            }
        }
        setShowCropper(false)
        setOriginalImage(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentUser) return
        setError('')

        // Validate display name
        const displayNameError = validateDisplayName(username)
        if (displayNameError) {
            setError(displayNameError)
            return
        }

        setLoading(true)

        const trimmedUsername = username.trim()
        if (trimmedUsername !== (currentUser.user_metadata?.username || currentUser.user_metadata?.display_name || '')) {
            const exists = await checkDisplayNameExists(trimmedUsername)
            if (exists) {
                setError('Username already taken')
                setLoading(false)
                return
            }
        }

        const { error: updateError } = await updateProfile(currentUser.id, {
            display_name: username || undefined,
            bio: bio || undefined,
            avatar_url: avatarUrl || undefined
        })

        setLoading(false)

        if (!updateError) {
            navigate('/Profile')
        }
    }

    if (!currentUser) {
        return (
            <main className="main">
                <div className="container settings-page">
                    <div className="settings-panel settings-panel--subpage">
                        <div className="settings-panel__header">
                            <p>Please <Link to="/login" className="settings-link-card__label" style={{ color: 'var(--color-primary)' }}>log in</Link> to edit your profile.</p>
                        </div>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <>
            {showCropper && originalImage && (
                <div className="modal-overlay" style={{ zIndex: 1000 }}>
                    <div className="edit-profile-modal">
                        <h3>Crop your avatar</h3>
                        <div className="edit-profile-modal__cropper-wrapper">
                            <Cropper
                                image={originalImage}
                                crop={crop}
                                rotation={rotation}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onRotationChange={setRotation}
                                onCropComplete={onCropComplete}
                            />
                        </div>
                        <div className="edit-profile-actions">
                            <button
                                type="button"
                                className="settings-btn settings-btn--primary"
                                onClick={handleCropSave}
                            >
                                Save Crop
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="main">
                <div className="container settings-page">
                    <div className="settings-panel settings-panel--subpage">
                        <form className="settings-form" onSubmit={handleSubmit} noValidate>
                            <div className="settings-avatar-picker">
                                <button
                                    type="button"
                                    className="settings-avatar-picker__preview avatar-hover-wrapper"
                                    onClick={handleAvatarClick}
                                    aria-label="Choose a profile picture"
                                    style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none' }}
                                >
                                    {!avatarUrl && <span>Choose image</span>}
                                    <span className="avatar-hover-overlay"><span className="avatar-hover-overlay__label">Change</span></span>
                                </button>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="d-none"
                                    id="avatar"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                />
                            </div>

                            <div className="settings-field">
                                <label htmlFor="username" className="settings-field__label">Username</label>
                                <input
                                    type="text"
                                    className="settings-field__input"
                                    id="username"
                                    placeholder="Your username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="settings-field">
                                <label htmlFor="bio" className="settings-field__label">Bio</label>
                                <textarea
                                    className="settings-field__input settings-field__textarea"
                                    id="bio"
                                    placeholder="Tell us about yourself..."
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    rows={3}
                                />
                            </div>

                            {error && <span className="settings-inline-feedback settings-inline-feedback--error"><span className="settings-inline-feedback__icon">!</span>{error}</span>}

                            <button type="submit" className="settings-btn settings-btn--primary" disabled={loading}>
                                {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </>
    )
}

export default EditProfile