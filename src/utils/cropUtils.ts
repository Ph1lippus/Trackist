// Utility functions for image cropping
export const getCroppedImg = (
    imageSrc: string,
    crop: { x: number; y: number; width: number; height: number },
    rotation = 0
): Promise<string> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            resolve(imageSrc)
            return
        }

        const img = new Image()
        img.onload = () => {
            canvas.width = crop.width
            canvas.height = crop.height

            ctx.save()
            ctx.translate(crop.width / 2, crop.height / 2)
            ctx.rotate((rotation * Math.PI) / 180)
            
            // Draw the cropped portion
            ctx.drawImage(
                img,
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                -crop.width / 2,
                -crop.height / 2,
                crop.width,
                crop.height
            )
            
            ctx.restore()
            resolve(canvas.toDataURL('image/jpeg'))
        }
        img.src = imageSrc
    })
}