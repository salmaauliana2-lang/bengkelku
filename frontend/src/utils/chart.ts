// Utilitas kecil untuk grafik SVG di dashboard.

export interface ChartPoint {
  x: number
  y: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// niceCeil membulatkan nilai maksimum ke angka "bulat" terdekat
// (1, 2, 5, atau 10 dikali pangkat sepuluh) agar garis bantu grafik rapi.
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0

  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10

  return nice * 10 ** exponent
}

// smoothPath membuat kurva halus (Catmull-Rom ke Bezier) dari titik-titik
// grafik supaya garis tren tidak terlihat kaku.
export function smoothPath(points: ChartPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const afterNext = points[index + 2] ?? next

    const tension = 0.18
    const control1X = current.x + (next.x - previous.x) * tension
    const control1Y = current.y + (next.y - previous.y) * tension
    const control2X = next.x - (afterNext.x - current.x) * tension
    const control2Y = next.y - (afterNext.y - current.y) * tension

    path +=
      ` C ${control1X.toFixed(2)} ${control1Y.toFixed(2)},` +
      ` ${control2X.toFixed(2)} ${control2Y.toFixed(2)},` +
      ` ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
  }

  return path
}

function parseDay(value: string): Date | null {
  const date = new Date(`${value}T00:00:00`)

  return Number.isNaN(date.getTime()) ? null : date
}

// formatDayShort dipakai sebagai label sumbu-X, contoh: "Sen 23".
export function formatDayShort(value: string): string {
  const date = parseDay(value)

  if (!date) return value

  return date.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
  })
}

// formatDayFull dipakai pada tooltip, contoh: "Senin, 23 Okt 2026".
export function formatDayFull(value: string): string {
  const date = parseDay(value)

  if (!date) return value

  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null

  return ((current - previous) / previous) * 100
}
