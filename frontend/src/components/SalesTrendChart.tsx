import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'

import type { SalesTrendPoint } from '../types'
import {
  clamp,
  formatDayFull,
  formatDayShort,
  niceCeil,
  percentChange,
  smoothPath,
  type ChartPoint,
} from '../utils/chart'
import { formatCompactCurrency, formatCurrency } from '../utils/format'

const WIDTH = 700
const HEIGHT = 290
const PADDING = { top: 24, right: 16, bottom: 38, left: 64 }
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const RANGES = [7, 30] as const

type Range = (typeof RANGES)[number]

interface SalesTrendChartProps {
  points: SalesTrendPoint[]
  detailTo?: string
}

export default function SalesTrendChart({
  points,
  detailTo,
}: SalesTrendChartProps) {
  const [range, setRange] = useState<Range>(7)
  const [hovered, setHovered] = useState<number | null>(null)

  const visible = useMemo(() => points.slice(-range), [points, range])
  const previous = useMemo(
    () => points.slice(-range * 2, -range),
    [points, range],
  )

  const total = visible.reduce((sum, point) => sum + point.total, 0)
  const count = visible.reduce((sum, point) => sum + point.count, 0)
  const previousTotal = previous.reduce((sum, point) => sum + point.total, 0)
  const change = percentChange(total, previousTotal)

  const maxValue = Math.max(...visible.map((point) => point.total), 0)
  const axisMax = niceCeil(maxValue) || 1
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const chartPoints: ChartPoint[] = visible.map((point, index) => {
    const x =
      visible.length === 1
        ? PADDING.left + PLOT_WIDTH / 2
        : PADDING.left + (index / (visible.length - 1)) * PLOT_WIDTH
    const y =
      PADDING.top + (1 - point.total / axisMax) * PLOT_HEIGHT

    return { x, y }
  })

  const linePath = smoothPath(chartPoints)
  const areaPath =
    chartPoints.length > 0
      ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${
          PADDING.top + PLOT_HEIGHT
        } L ${chartPoints[0].x} ${PADDING.top + PLOT_HEIGHT} Z`
      : ''

  const labelStep = Math.max(1, Math.ceil(visible.length / 7))
  const activePoint = hovered === null ? null : chartPoints[hovered]
  const activeDay = hovered === null ? null : visible[hovered]

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    if (visible.length === 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    const x = ratio * WIDTH
    const index =
      visible.length === 1
        ? 0
        : Math.round(
            ((x - PADDING.left) / PLOT_WIDTH) * (visible.length - 1),
          )

    setHovered(clamp(index, 0, visible.length - 1))
  }

  const average = visible.length > 0 ? total / visible.length : 0
  const best = visible.reduce<SalesTrendPoint | null>(
    (top, point) => (!top || point.total > top.total ? point : top),
    null,
  )

  return (
    <article className="panel chart-panel">
      <div className="panel-header">
        <div>
          <h2>Grafik Penjualan</h2>
          <p>Omzet harian dari transaksi yang sudah selesai.</p>
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
          <span>Total omzet</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
        <div>
          <span>Rata-rata / hari</span>
          <strong>{formatCurrency(Math.round(average))}</strong>
        </div>
        <div>
          <span>Transaksi</span>
          <strong>{count}</strong>
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

      {visible.length === 0 ? (
        <p className="chart-empty">Belum ada data penjualan.</p>
      ) : (
        <div className="chart-canvas">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="chart-svg"
            role="img"
            aria-label={`Grafik penjualan ${range} hari terakhir, total ${formatCurrency(
              total,
            )}`}
          >
            <defs>
              <linearGradient
                id="sales-area-gradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#a3263a" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#a3263a" stopOpacity="0" />
              </linearGradient>
              <linearGradient
                id="sales-line-gradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#7f1d2b" />
                <stop offset="55%" stopColor="#a3263a" />
                <stop offset="100%" stopColor="#ffb020" />
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
                    x={PADDING.left - 12}
                    y={y + 4}
                    textAnchor="end"
                    className="chart-axis-label"
                  >
                    {formatCompactCurrency(value)}
                  </text>
                </g>
              )
            })}

            <path d={areaPath} fill="url(#sales-area-gradient)" />

            <path
              d={linePath}
              fill="none"
              stroke="url(#sales-line-gradient)"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              className="chart-line"
            />

            {chartPoints.map((point, index) => (
              <circle
                key={visible[index].date}
                cx={point.x}
                cy={point.y}
                r={hovered === index ? 6 : 3.5}
                className={
                  hovered === index
                    ? 'chart-point chart-point-active'
                    : 'chart-point'
                }
              />
            ))}

            {visible.map((point, index) => {
              if (
                index % labelStep !== 0 &&
                index !== visible.length - 1
              ) {
                return null
              }

              return (
                <text
                  key={point.date}
                  x={chartPoints[index].x}
                  y={HEIGHT - 12}
                  textAnchor="middle"
                  className="chart-axis-label"
                >
                  {formatDayShort(point.date)}
                </text>
              )
            })}

            {activePoint && (
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={PADDING.top}
                y2={PADDING.top + PLOT_HEIGHT}
                className="chart-guide"
              />
            )}

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

          {activePoint && activeDay && (
            <div
              className={`chart-tooltip${
                (activePoint.y / HEIGHT) * 100 < 28
                  ? ' chart-tooltip-below'
                  : ''
              }`}
              style={{
                left: `${clamp((activePoint.x / WIDTH) * 100, 10, 90)}%`,
                top: `${(activePoint.y / HEIGHT) * 100}%`,
              }}
            >
              <strong>{formatDayFull(activeDay.date)}</strong>
              <span className="chart-tooltip-value">
                {formatCurrency(activeDay.total)}
              </span>
              <small>{activeDay.count} transaksi</small>
            </div>
          )}
        </div>
      )}

      <div className="chart-footer">
        {best && best.total > 0 ? (
          <p className="chart-footnote">
            Penjualan tertinggi: <strong>{formatDayFull(best.date)}</strong> ·{' '}
            {formatCurrency(best.total)}
          </p>
        ) : (
          <span />
        )}

        {detailTo && (
          <Link className="chart-detail-link" to={detailTo}>
            Buka halaman penjualan →
          </Link>
        )}
      </div>
    </article>
  )
}
