import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { ServiceTrendPoint } from '../types'
import {
  clamp,
  formatDayFull,
  formatDayShort,
  niceCeil,
  percentChange,
} from '../utils/chart'

const WIDTH = 700
const HEIGHT = 290
const PADDING = { top: 24, right: 16, bottom: 38, left: 46 }
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const RANGES = [7, 30] as const

type Range = (typeof RANGES)[number]

interface ServiceTrafficChartProps {
  points: ServiceTrendPoint[]
}

export default function ServiceTrafficChart({
  points,
}: ServiceTrafficChartProps) {
  const [range, setRange] = useState<Range>(7)
  const [hovered, setHovered] = useState<number | null>(null)

  const visible = useMemo(() => points.slice(-range), [points, range])
  const previous = useMemo(
    () => points.slice(-range * 2, -range),
    [points, range],
  )

  const visits = visible.reduce((sum, point) => sum + point.total, 0)
  const completed = visible.reduce((sum, point) => sum + point.completed, 0)
  const previousVisits = previous.reduce((sum, point) => sum + point.total, 0)
  const change = percentChange(visits, previousVisits)

  const maxValue = Math.max(...visible.map((point) => point.total), 0)
  const axisMax = Math.max(niceCeil(maxValue), 4)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const bandWidth = PLOT_WIDTH / Math.max(visible.length, 1)
  const barWidth = Math.min(26, bandWidth * 0.5)

  const activeDay = hovered === null ? null : visible[hovered]
  const activeX =
    hovered === null
      ? 0
      : PADDING.left + bandWidth * hovered + bandWidth / 2
  const activeY =
    activeDay === null
      ? 0
      : PADDING.top +
        (1 - activeDay.total / axisMax) * PLOT_HEIGHT

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    if (visible.length === 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    const index = Math.floor(ratio * visible.length)

    setHovered(clamp(index, 0, visible.length - 1))
  }

  const labelStep = Math.max(1, Math.ceil(visible.length / 7))
  const completionRate = visits > 0 ? (completed / visits) * 100 : 0

  return (
    <article className="panel chart-panel">
      <div className="panel-header">
        <div>
          <h2>Traffic Servis</h2>
          <p>Kendaraan yang masuk servis setiap hari.</p>
        </div>

        <div className="chart-range" role="group" aria-label="Rentang grafik">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={range === option ? 'active' : ''}
              aria-pressed={range === option}
              onClick={() => {
                setRange(option)
                setHovered(null)
              }}
            >
              {option} hari
            </button>
          ))}
        </div>
      </div>

      <div className="chart-metrics">
        <div>
          <span>Kunjungan</span>
          <strong>{visits}</strong>
        </div>
        <div>
          <span>Selesai</span>
          <strong>{completed}</strong>
        </div>
        <div>
          <span>Rasio selesai</span>
          <strong>{completionRate.toFixed(0)}%</strong>
        </div>

        {change !== null && (
          <span
            className={`trend-pill ${
              change >= 0 ? 'trend-pill-up' : 'trend-pill-down'
            }`}
          >
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%
            <small> vs {range} hari sebelumnya</small>
          </span>
        )}
      </div>

      <div className="chart-legend">
        <span>
          <i className="legend-swatch legend-swatch-total" /> Kunjungan
        </span>
        <span>
          <i className="legend-swatch legend-swatch-done" /> Selesai
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="chart-empty">Belum ada data servis.</p>
      ) : (
        <div className="chart-canvas">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="chart-svg"
            role="img"
            aria-label={`Traffic servis ${range} hari terakhir, ${visits} kunjungan dan ${completed} selesai`}
          >
            <defs>
              <linearGradient
                id="service-bar-total"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#8fb0f9" />
                <stop offset="100%" stopColor="#dbe6ff" />
              </linearGradient>
              <linearGradient
                id="service-bar-done"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#22c3a6" />
                <stop offset="100%" stopColor="#0e9f86" />
              </linearGradient>
            </defs>

            {ticks.map((tick) => {
              const value = axisMax * tick
              const y = PADDING.top + PLOT_HEIGHT * (1 - tick)

              return (
                <g key={tick}>
                  <line
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    className="chart-grid-line"
                  />
                  <text
                    x={PADDING.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="chart-axis-label"
                  >
                    {Math.round(value)}
                  </text>
                </g>
              )
            })}

            {hovered !== null && (
              <rect
                x={PADDING.left + bandWidth * hovered + 2}
                y={PADDING.top}
                width={Math.max(bandWidth - 4, 6)}
                height={PLOT_HEIGHT}
                rx="8"
                className="chart-column-highlight"
              />
            )}

            {visible.map((point, index) => {
              const centerX = PADDING.left + bandWidth * index + bandWidth / 2
              const totalHeight = (point.total / axisMax) * PLOT_HEIGHT
              const doneHeight = (point.completed / axisMax) * PLOT_HEIGHT

              return (
                <g
                  key={point.date}
                  style={{ animationDelay: `${index * 18}ms` }}
                  className="chart-bar-group"
                >
                  <rect
                    x={centerX - barWidth / 2}
                    y={PADDING.top + PLOT_HEIGHT - totalHeight}
                    width={barWidth}
                    height={Math.max(totalHeight, point.total > 0 ? 3 : 0)}
                    rx="5"
                    fill="url(#service-bar-total)"
                  />
                  <rect
                    x={centerX - barWidth / 2}
                    y={PADDING.top + PLOT_HEIGHT - doneHeight}
                    width={barWidth}
                    height={Math.max(doneHeight, point.completed > 0 ? 3 : 0)}
                    rx="5"
                    fill="url(#service-bar-done)"
                  />
                </g>
              )
            })}

            {visible.map((point, index) => {
              if (index % labelStep !== 0 && index !== visible.length - 1) {
                return null
              }

              return (
                <text
                  key={point.date}
                  x={PADDING.left + bandWidth * index + bandWidth / 2}
                  y={HEIGHT - 12}
                  textAnchor="middle"
                  className="chart-axis-label"
                >
                  {formatDayShort(point.date)}
                </text>
              )
            })}

            <rect
              x={PADDING.left}
              y={PADDING.top}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
              fill="transparent"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHovered(null)}
            />
          </svg>

          {activeDay && (
            <div
              className={`chart-tooltip${
                (activeY / HEIGHT) * 100 < 28 ? ' chart-tooltip-below' : ''
              }`}
              style={{
                left: `${clamp((activeX / WIDTH) * 100, 10, 90)}%`,
                top: `${(activeY / HEIGHT) * 100}%`,
              }}
            >
              <strong>{formatDayFull(activeDay.date)}</strong>
              <span className="chart-tooltip-value">
                {activeDay.total} kunjungan
              </span>
              <small>{activeDay.completed} selesai</small>
            </div>
          )}
        </div>
      )}

      <p className="chart-footnote">
        Customer datang, dikerjakan, lalu selesai — semua terpantau di sini.
      </p>
    </article>
  )
}
