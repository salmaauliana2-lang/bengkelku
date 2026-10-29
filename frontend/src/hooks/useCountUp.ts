import { useEffect, useState, useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY)
  media.addEventListener('change', onChange)

  return () => media.removeEventListener('change', onChange)
}

function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

// useCountUp menganimasikan angka dari 0 menuju target saat data siap.
// Animasi otomatis dimatikan bila pengguna meminta reduced motion.
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  )

  useEffect(() => {
    if (reduceMotion || target === 0) return

    let frame = 0
    let start = 0

    const tick = (now: number) => {
      if (start === 0) start = now

      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3

      setValue(Math.round(target * eased))

      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [target, duration, reduceMotion])

  return reduceMotion ? target : value
}
