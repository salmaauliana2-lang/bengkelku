import { useId } from 'react'

import { smoothPath, type ChartPoint } from '../utils/chart'

const WIDTH = 120
const HEIGHT = 36

const toneColors: Record<string, string> = {
  blue: '#4c7bf4',
  green: '#12b76a',
  amber: '#f79009',
  red: '#f04438',
}

interface SparklineProps {
  values: number[]
  tone?: keyof typeof toneColors
}

// Sparkline adalah grafik mini tanpa sumbu untuk kartu statistik.
export default function Sparkline({ values, tone = 'blue' }: SparklineProps) {
  const gradientId = `spark-${useId().replace(/[:]/g, '')}`
  const color = toneColors[tone] ?? toneColors.blue

  if (values.length === 0) {
    return <span className="sparkline sparkline-empty" />
  }

  const max = Math.max(...values, 1)
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH

  const points: ChartPoint[] = values.map((value, index) => ({
    x: values.length > 1 ? index * step : WIDTH / 2,
    y: HEIGHT - 3 - (value / max) * (HEIGHT - 8),
  }))

  const line = smoothPath(points)
  const area = `${line} L ${points[points.length - 1].x} ${HEIGHT} L ${
    points[0].x
  } ${HEIGHT} Z`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="sparkline"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
