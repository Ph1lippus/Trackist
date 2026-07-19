import React, { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getProfile, updateProfile, uploadAvatar } from '../services/profileService'
import { validateDisplayName } from '../utils/validation'
import type { User } from '@supabase/supabase-js'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../utils/cropUtils'

interface Point {
    x: number
    y: number
}

const EditProfile: React.FC = () => {
    const navigate = useNavigate()
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
            const { data: { user } } = await supabase.auth.getUser()
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
                <div className="container">
                    <div className="row justify-content-center">
                        <div className="col-md-6 col-lg-5">
                            <div className="auth-card">
                                <h2 className="auth-title">Edit Profile</h2>
                                <p className="auth-text">Please <Link to="/login" className="auth-link">login</Link> to edit your profile.</p>
                            </div>
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
                    <div className="edit-profile-modal" style={{ maxWidth: '500px', padding: '1rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Crop your avatar</h3>
                        <div style={{ position: 'relative', width: '100%', height: '300px', backgroundColor: '#333' }}>
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
                        <div className="edit-profile-actions" style={{ marginTop: '1rem' }}>
                            <button 
                                type="button"
                                className="edit-profile-btn edit-profile-btn--primary"
                                onClick={handleCropSave}
                            >
                                Save Crop
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <main className="main">
                <div className="container">
                    <div className="row justify-content-center">
                        <div className="col-md-6 col-lg-5">
                            <div className="auth-card">
                                <h2 className="auth-title">Edit Profile</h2>
                                <form onSubmit={handleSubmit} noValidate>
<div className="mb-3" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div 
                                                onClick={handleAvatarClick}
                                                style={{ 
                                                    width: '100%',
                                                    aspectRatio: '1',
                                                    borderRadius: '50%',
                                                    background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'var(--color-primary)',
                                                    color: 'var(--color-black)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    marginBottom: '0.5rem',
                                                    border: '2px solid var(--color-platinum)',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                    maxWidth: '200px',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                className="avatar-hover-wrapper"
                                            >
                                                {!avatarUrl && (
                                                    <span style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.6)' }}>
                                                        Click to select image
                                                    </span>
                                                )}
                                                {avatarUrl && (
                                                    <div className="avatar-hover-overlay">
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--color-platinum)', background: 'rgba(133,138,227,0.1)', padding: '0.35rem 0.75rem', borderRadius: '20px', fontWeight: '600' }}>Change</span>
                                                    </div>
                                                )}
                                            </div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            className="d-none"
                                            id="avatar"
                                            accept="image/*"
                                            onChange={handleAvatarChange}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label htmlFor="username" className="form-label">Username</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="username"
                                            placeholder="Your username"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label htmlFor="bio" className="form-label">Bio</label>
                                        <textarea
                                            className="form-control"
                                            id="bio"
                                            placeholder="Tell us about yourself..."
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                    {error && <div className="alert alert-danger">{error}</div>}
                                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                                        {loading ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </>
    )
}

export default EditProfile