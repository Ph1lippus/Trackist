import confetti from 'canvas-confetti'

/**
 * Cosmic Confetti
 *
 * A smooth, elegant celebration that matches Trackist's space aesthetic.
 * - Twin fountains from both bottom corners
 * - Occasional shooting stars through the center
 * - Soft sparkle finish
 * - Prevents overlapping animations
 */

const COSMIC_PALETTE = [
  '#858ae3', // purple
  '#a9ace4', // light purple
  '#e7e8ec', // platinum
]

let isAnimating = false

export const launchCosmicConfetti = (opts?: { duration?: number }) => {
  if (isAnimating) return
  isAnimating = true

  const duration = opts?.duration ?? 2800
  const animationEnd = Date.now() + duration

  const random = (min: number, max: number) =>
    Math.random() * (max - min) + min

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now()

    if (timeLeft <= 0) {
      clearInterval(interval)

      // Final sparkle burst
      confetti({
        particleCount: 70,
        spread: 360,
        startVelocity: 14,
        gravity: 0.3,
        ticks: 160,
        scalar: 0.8,
        colors: COSMIC_PALETTE,
        origin: {
          x: 0.5,
          y: 0.35,
        },
        zIndex: 99999,
      })

      setTimeout(() => {
        isAnimating = false
      }, 600)

      return
    }

    // Fade intensity naturally
    const progress = timeLeft / duration

    // Left fountain
    confetti({
      particleCount: 4,
      angle: random(52, 68),
      spread: random(40, 65),
      startVelocity: random(36, 50) * progress + 10,
      gravity: 0.82,
      scalar: random(0.9, 1.3),
      drift: random(0.2, 0.8),
      ticks: 220,
      colors: COSMIC_PALETTE,
      shapes: ['circle'],
      origin: {
        x: 0,
        y: 1,
      },
      zIndex: 99999,
    })

    // Right fountain
    confetti({
      particleCount: 4,
      angle: random(112, 128),
      spread: random(40, 65),
      startVelocity: random(36, 50) * progress + 10,
      gravity: 0.82,
      scalar: random(0.9, 1.3),
      drift: random(-0.8, -0.2),
      ticks: 220,
      colors: COSMIC_PALETTE,
      shapes: ['circle'],
      origin: {
        x: 1,
        y: 1,
      },
      zIndex: 99999,
    })
  }, 90)
}