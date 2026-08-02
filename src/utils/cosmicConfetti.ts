import confetti from 'canvas-confetti'

/**
 * Cosmic Confetti – a lightweight, theme-aligned celebration.
 *
 * Fires an elegant dual-fountain of particles rising from the lower-left
 * and lower-right corners of the viewport.  Uses the app's cosmic palette
 * (no default rainbow colours) and cleans up after itself.
 */

// Theme palette – pulled from src/styles/global.css :root
const COSMIC_PALETTE = [
    '#858ae3', // --color-primary  (soft purple)
    '#a9ace4', // --color-primary-lighter
    '#68ffae', // --color-mint     (electric green)
    '#307351', // --color-green    (deep forest)
    '#e7e8ec', // --color-platinum (cool starlight)
]

// Guard so we never stack multiple celebrations on top of each other
let isAnimating = false

/**
 * Launch the Cosmic Confetti celebration.
 *
 * @param opts.duration  Total runtime in ms (default 2500).
 */
export const launchCosmicConfetti = (opts?: { duration?: number }) => {
    if (isAnimating) return
    isAnimating = true

    const duration = opts?.duration ?? 2500
    const end = Date.now() + duration

    // Dual-fountain: one from lower-left, one from lower-right.
    // Each frame we fire a small burst so the effect feels continuous
    // rather than a single chaotic explosion.
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
        if (Date.now() > end) {
            clearInterval(interval)
            // Give the last particles a moment to settle, then release the guard
            setTimeout(() => {
                isAnimating = false
            }, 500)
            return
        }

        // Left fountain - shoots inward to the right
        confetti({
        particleCount: 3,
        angle: 60, // Shoots up and right
        spread: 55,
        origin: { x: 0, y: 1 }, // Exact bottom-left corner
        colors: COSMIC_PALETTE,
        scalar: 1.2,
        gravity: 0.8,
        zIndex: 99999,
        shapes: ['circle'],
        drift: 0.5, // Drifts right
        });

        // Right fountain - shoots inward to the left
        confetti({
        particleCount: 3,
        angle: 120, // Shoots up and left
        spread: 55,
        origin: { x: 1, y: 1 }, // Exact bottom-right corner
        colors: COSMIC_PALETTE,
        scalar: 1.2,
        gravity: 0.8,
        zIndex: 99999,
        shapes: ['circle'],
        drift: -0.5, // Fixed typo: now a number drifting left
        });
    }, 120)
}


