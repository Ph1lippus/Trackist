import { useEffect } from 'react';

export const useCosmicClock = (): void => {
  useEffect(() => {
    let frameId: number;

    const tick = (): void => {
      // performance.now() tracks absolute app lifespan time, ignoring page routing
      const elapsedSeconds = performance.now() / 1000;
      document.documentElement.style.setProperty('--cosmic-time', elapsedSeconds.toString());
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);
};
