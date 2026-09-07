import React, { useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../../utils/cropUtils'
import { uploadAvatar } from '../../services/profileService'
import { Loader2 } from 'lucide-react'

interface Point {
    x: number
    y: number
}

interface AvatarUploaderProps {
    avatarUrl: string | null
    user: User
    onAvatarChange?: (url: string | null) => void
}

const AvatarUploader: React.FC<AvatarUploaderProps> = ({ avatarUrl, user, onAvatarChange }) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [originalImage, setOriginalImage] = useState<string | null>(null)
    const [showCropper, setShowCropper] = useState(false)
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [rotation, setRotation] = useState(0)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)

    const handleAvatarClick = () => {
        fileInputRef.current?.click()
    }

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setError('')
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

    const onCropComplete = (_: unknown, croppedPixels: { x: number; y: number; width: number; height: number }) => {
        setCroppedAreaPixels(croppedPixels)
    }

    const handleCropSave = async () => {
        if (!originalImage || !croppedAreaPixels) return
        setUploading(true)
        setError('')
        try {
            const croppedImage = await getCroppedImg(originalImage, croppedAreaPixels, rotation)
            const response = await fetch(croppedImage)
            const blob = await response.blob()
            const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })

            const { url, error: uploadError } = await uploadAvatar(file, user.id)
            if (uploadError) {
                setError(uploadError)
                return
            }
            onAvatarChange?.(url)
        } catch {
            setError('Failed to process image')
        } finally {
            setUploading(false)
            setShowCropper(false)
            setOriginalImage(null)
        }
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
                                disabled={uploading}
                            >
                                {uploading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Saving...</> : 'Save Crop'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="settings-avatar-picker settings-avatar-picker--stacked">
                <button
                    type="button"
                    className="settings-avatar-picker__preview avatar-hover-wrapper"
                    onClick={handleAvatarClick}
                    aria-label="Choose a profile picture"
                    style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none' }}
                >
                    {!avatarUrl && <span>Add</span>}
                    <span className="avatar-hover-overlay"><span className="avatar-hover-overlay__label">Change</span></span>
                </button>
                <span className="settings-avatar-picker__label">Change profile picture</span>

                <input
                    ref={fileInputRef}
                    type="file"
                    className="d-none"
                    accept="image/*"
                    onChange={handleAvatarChange}
                />
            </div>

            {error && <span className="settings-inline-feedback settings-inline-feedback--error"><span className="settings-inline-feedback__icon">!</span>{error}</span>}
        </>
    )
}

export default AvatarUploader