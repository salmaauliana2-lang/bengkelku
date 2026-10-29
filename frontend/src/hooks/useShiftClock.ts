import { useEffect, useState } from 'react'

// useShiftClock mengembalikan waktu saat ini dan diperbarui tiap detik
// untuk jam "shift" pada hero dashboard.
export function useShiftClock(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)

    return () => window.clearInterval(timer)
  }, [])

  return now
}
