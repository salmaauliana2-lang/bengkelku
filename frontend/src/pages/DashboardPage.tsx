import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import SalesTrendChart from '../components/SalesTrendChart'
import ServiceTrafficChart from '../components/ServiceTrafficChart'
import Sparkline from '../components/Sparkline'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { useCountUp } from '../hooks/useCountUp'
import { useShiftClock } from '../hooks/useShiftClock'
import { getDashboardSummary } from '../services/dashboard'
import type { DashboardSummary, ServiceStatus } from '../types'
import { percentChange } from '../utils/chart'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  serviceStatusLabels,
} from '../utils/format'

function longDate(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const clock = useShiftClock()

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const result = await getDashboardSummary()

        if (active) {
          setSummary(result.data)
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Gagal memuat dashboard',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const canSales = user?.role === 'owner' || user?.role === 'admin'
  const canServices = canSales || user?.role === 'mekanik'

  const activeServiceCount = summary
    ? summary.services.pending + summary.services.in_progress
    : 0

  const salesTrend = summary?.sales_trend ?? []
  const serviceTrend = summary?.service_trend ?? []
  const lastSales = salesTrend.slice(-7)
  const lastServices = serviceTrend.slice(-7)

  const salesToday = summary?.sales.today_total ?? 0
  const salesYesterday =
    lastSales.length > 1 ? lastSales[lastSales.length - 2].total : 0
  const salesDelta = percentChange(salesToday, salesYesterday)

  const visitsToday =
    lastServices.length > 0 ? lastServices[lastServices.length - 1].total : 0
  const visitsYesterday =
    lastServices.length > 1
      ? lastServices[lastServices.length - 2].total
      : 0
  const visitsDelta = percentChange(visitsToday, visitsYesterday)

  const animatedSales = useCountUp(salesToday)
  const animatedActive = useCountUp(activeServiceCount)
  const animatedLowStock = useCountUp(summary?.products.low_stock ?? 0)
  const animatedPurchases = useCountUp(summary?.purchases.month_total ?? 0)

  const serviceTotal = summary?.services.total ?? 0
  const serviceSegments: Array<{
    key: ServiceStatus
    label: string
    value: number
    color: string
  }> = summary
    ? [
        {
          key: 'pending',
          label: 'Menunggu',
          value: summary.services.pending,
          color: '#f79009',
        },
        {
          key: 'in_progress',
          label: 'Dikerjakan',
          value: summary.services.in_progress,
          color: '#2e90fa',
        },
        {
          key: 'completed',
          label: 'Selesai',
          value: summary.services.completed,
          color: '#12b76a',
        },
        {
          key: 'cancelled',
          label: 'Dibatalkan',
          value: summary.services.cancelled,
          color: '#f04438',
        },
      ]
    : []

  let donutCursor = 0
  const donutStops = serviceSegments
    .map((segment) => {
      const start = donutCursor
      const share = serviceTotal > 0 ? (segment.value / serviceTotal) * 100 : 0
      donutCursor += share

      return `${segment.color} ${start}% ${donutCursor}%`
    })
    .join(', ')

  const lowStockShare =
    summary && summary.products.total > 0
      ? Math.min(
          (summary.products.low_stock / summary.products.total) * 100,
          100,
        )
      : 0

  const quickFeatures = [
    {
      to: '/inventory',
      icon: '▦',
      label: 'Inventaris',
      meta: `${formatNumber(summary?.products.total ?? 0)} spare part`,
      tone: 'blue',
    },
    {
      to: canSales ? '/sales' : '/inventory',
      icon: '↗',
      label: 'Penjualan',
      meta: `${formatNumber(summary?.sales.total_count ?? 0)} nota`,
      tone: 'green',
    },
    {
      to: canServices ? '/services' : '/inventory',
      icon: '⚙',
      label: 'Servis',
      meta: `${formatNumber(serviceTotal)} order`,
      tone: 'amber',
    },
    {
      to: canSales ? '/purchases' : '/inventory',
      icon: '▤',
      label: 'Pembelian',
      meta: `${formatNumber(summary?.purchases.total_count ?? 0)} PO`,
      tone: 'violet',
    },
  ]

  function rowNavigation(path: string | null) {
    if (!path) return {}

    return {
      className: 'row-click',
      role: 'link' as const,
      tabIndex: 0,
      onClick: () => navigate(path),
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          navigate(path)
        }
      },
    }
  }

  return (
    <section>
      {error && <div className="alert alert-error">{error}</div>}

      {loading && <div className="panel loading-row">Memuat dek bengkel…</div>}

      {summary && (
        <>
          <section className="garage-hero">
            <div className="hero-copy">
              <span className="hero-kicker">
                <i className="pulse-dot" aria-hidden="true" />
                Shift aktif · {longDate(clock)}
              </span>
              <h1>
                Halo, <em>{user?.name.split(' ')[0] ?? 'Pengguna'}</em>.
              </h1>
              <p>
                Bengkel siap tempur. Omzet, antrian pit, dan stok spare part
                terpantau dalam satu dek.
              </p>
              <div className="hero-actions">
                {canSales ? (
                  <Link className="button button-primary" to="/sales">
                    + Transaksi Baru
                  </Link>
                ) : (
                  <Link className="button button-primary" to="/inventory">
                    Buka Inventaris
                  </Link>
                )}
                {canServices ? (
                  <Link className="button button-ghost" to="/services">
                    Buka Antrian Servis
                  </Link>
                ) : (
                  <Link className="button button-ghost" to="/inventory">
                    Cek Stok Spare Part
                  </Link>
                )}
              </div>
            </div>

            <div className="hero-side">
              <div className="hero-clock">
                <span>Waktu workshop</span>
                <strong>
                  {clock.toLocaleTimeString('id-ID', { hour12: false })}
                </strong>
                <small>WIB · zona bengkel</small>
              </div>

              <div className="hero-live">
                <div>
                  <b>{summary.sales.today_count}</b>
                  <span>nota hari ini</span>
                </div>
                <div>
                  <b>{activeServiceCount}</b>
                  <span>kendaraan di pit</span>
                </div>
              </div>
            </div>

            <span className="hero-watermark" aria-hidden="true">
              ⚙
            </span>
          </section>

          <div className="stat-grid">
            <Link
              to={canSales ? '/sales' : '/inventory'}
              className="stat-card stat-card-blue is-clickable"
            >
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-blue">↗</span>
                <span className="stat-tag">SALES</span>
                {salesDelta !== null && (
                  <span
                    className={`trend-pill ${
                      salesDelta >= 0 ? 'trend-pill-up' : 'trend-pill-down'
                    }`}
                  >
                    {salesDelta >= 0 ? '▲' : '▼'}{' '}
                    {Math.abs(salesDelta).toFixed(0)}%
                  </span>
                )}
              </div>
              <p>Penjualan hari ini</p>
              <strong className="mono-number">
                {formatCurrency(animatedSales)}
              </strong>
              <small>{summary.sales.today_count} transaksi selesai</small>
              <Sparkline
                values={lastSales.map((point) => point.total)}
                tone="blue"
              />
              <span className="stat-open">Buka penjualan →</span>
            </Link>

            <Link
              to={canServices ? '/services' : '/inventory'}
              className="stat-card stat-card-amber is-clickable"
            >
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-amber">⚙</span>
                <span className="stat-tag">PIT</span>
                {visitsDelta !== null && (
                  <span
                    className={`trend-pill ${
                      visitsDelta >= 0 ? 'trend-pill-up' : 'trend-pill-down'
                    }`}
                  >
                    {visitsDelta >= 0 ? '▲' : '▼'}{' '}
                    {Math.abs(visitsDelta).toFixed(0)}%
                  </span>
                )}
              </div>
              <p>Servis aktif</p>
              <strong className="mono-number">
                {formatNumber(animatedActive)}
              </strong>
              <small>
                {summary.services.pending} menunggu ·{' '}
                {summary.services.in_progress} dikerjakan
              </small>
              <Sparkline
                values={lastServices.map((point) => point.total)}
                tone="amber"
              />
              <span className="stat-open">Buka antrian →</span>
            </Link>

            <Link
              to="/inventory"
              className="stat-card stat-card-red is-clickable"
            >
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-red">▦</span>
                <span className="stat-tag">STOK</span>
                <span className="trend-pill trend-pill-neutral">
                  {summary.products.total} produk
                </span>
              </div>
              <p>Stok menipis</p>
              <strong className="mono-number">
                {formatNumber(animatedLowStock)}
              </strong>
              <small>{summary.products.out_of_stock} produk habis</small>
              <div className="stat-meter" aria-hidden="true">
                <span style={{ width: `${lowStockShare}%` }} />
              </div>
              <span className="stat-open">Cek inventaris →</span>
            </Link>

            <Link
              to={canSales ? '/purchases' : '/inventory'}
              className="stat-card stat-card-green is-clickable"
            >
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-green">▤</span>
                <span className="stat-tag">SUPPLY</span>
                <span className="trend-pill trend-pill-neutral">
                  {summary.purchases.month_count} PO
                </span>
              </div>
              <p>Pembelian bulan ini</p>
              <strong className="mono-number">
                {formatCurrency(animatedPurchases)}
              </strong>
              <small>{summary.purchases.today_count} pembelian hari ini</small>
              <span className="stat-open">Buka pembelian →</span>
            </Link>
          </div>

          <div className="dash-grid">
            <div className="dash-span-7">
              <SalesTrendChart
                points={salesTrend}
                detailTo={canSales ? '/sales' : undefined}
              />
            </div>

            <div className="dash-span-5">
              <article className="panel quick-panel">
                <div className="panel-header">
                  <div>
                    <h2>Pit Crew Shortcut</h2>
                    <p>Langsung menuju fitur tanpa muat ulang.</p>
                  </div>
                  <span className="live-chip">
                    <i className="pulse-dot" aria-hidden="true" />
                    LIVE
                  </span>
                </div>

                <div className="quick-grid">
                  {quickFeatures.map((feature) => (
                    <Link
                      key={feature.label}
                      to={feature.to}
                      className={`quick-tile quick-tile-${feature.tone}`}
                    >
                      <span className="quick-icon">{feature.icon}</span>
                      <strong>{feature.label}</strong>
                      <small>{feature.meta}</small>
                      <span className="quick-arrow" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  ))}
                </div>

                <div className="quick-note">
                  <span className="status-dot status-dot-live" />
                  Semua modul tersambung ke server yang sama.
                </div>
              </article>
            </div>

            <div className="dash-span-5">
              <ServiceTrafficChart
                points={serviceTrend}
                detailTo={canServices ? '/services' : undefined}
              />
            </div>

            <div className="dash-span-3">
              <article className="panel status-panel">
                <div className="panel-header">
                  <div>
                    <h2>Status Pit</h2>
                    <p>Distribusi servis.</p>
                  </div>
                </div>

                <div
                  className="donut-chart donut-compact"
                  style={{ background: `conic-gradient(${donutStops})` }}
                  role="img"
                  aria-label={`Total ${serviceTotal} servis`}
                >
                  <div className="donut-center">
                    <strong>{serviceTotal}</strong>
                    <span>servis</span>
                  </div>
                </div>

                <ul className="donut-legend">
                  {serviceSegments.map((segment) => {
                    const row = (
                      <>
                        <span
                          className="status-dot"
                          style={{ background: segment.color }}
                        />
                        <span className="donut-legend-label">
                          {segment.label}
                        </span>
                        <strong>{segment.value}</strong>
                      </>
                    )

                    return (
                      <li key={segment.key}>
                        {canServices ? (
                          <Link
                            className="donut-legend-row"
                            to={`/services?status=${segment.key}`}
                          >
                            {row}
                            <span className="donut-legend-arrow">→</span>
                          </Link>
                        ) : (
                          <span className="donut-legend-row">{row}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <p className="panel-note">
                  {summary.services.unpaid} servis belum lunas.
                </p>
              </article>
            </div>

            <div className="dash-span-4">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Ringkasan Penjualan</h2>
                    <p>Akumulasi transaksi selesai.</p>
                  </div>
                  {canSales && (
                    <Link className="text-link" to="/sales">
                      Lihat semua
                    </Link>
                  )}
                </div>

                <dl className="summary-list summary-compact">
                  <div>
                    <dt>Hari ini</dt>
                    <dd>
                      {formatCurrency(summary.sales.today_total)}
                      <span>{summary.sales.today_count} transaksi</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Bulan ini</dt>
                    <dd>
                      {formatCurrency(summary.sales.month_total)}
                      <span>{summary.sales.month_count} transaksi</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>
                      {formatCurrency(summary.sales.total_revenue)}
                      <span>{summary.sales.total_count} transaksi</span>
                    </dd>
                  </div>
                </dl>
              </article>
            </div>

            <div className="dash-span-6">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Stok Menipis</h2>
                    <p>Klik produk untuk cek di inventaris.</p>
                  </div>
                  <Link className="text-link" to="/inventory">
                    Inventaris
                  </Link>
                </div>

                {summary.low_stock_products.length === 0 ? (
                  <p className="empty-text">Semua stok produk aman.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table compact-table">
                      <thead>
                        <tr>
                          <th>Produk</th>
                          <th>SKU</th>
                          <th className="align-right">Stok</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.low_stock_products.map((product) => (
                          <tr
                            key={product.id}
                            {...rowNavigation(
                              `/inventory?q=${encodeURIComponent(product.sku)}`,
                            )}
                          >
                            <td>
                              <Link
                                className="row-link"
                                to={`/inventory?q=${encodeURIComponent(
                                  product.sku,
                                )}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {product.name}
                              </Link>
                            </td>
                            <td className="mono">{product.sku}</td>
                            <td className="align-right">
                              <StatusBadge
                                status={product.stock === 0 ? 'out' : 'pending'}
                                label={`${product.stock}`}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>

            <div className="dash-span-6">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Penjualan Terbaru</h2>
                    <p>Klik nota untuk membuka detail.</p>
                  </div>
                  {canSales && (
                    <Link className="text-link" to="/sales">
                      Semua
                    </Link>
                  )}
                </div>

                {summary.recent_sales.length === 0 ? (
                  <p className="empty-text">Belum ada penjualan.</p>
                ) : (
                  <ul className="activity-list activity-compact">
                    {summary.recent_sales.map((sale) => (
                      <li
                        key={sale.id}
                        {...(canSales
                          ? rowNavigation(`/sales?sale=${sale.id}`)
                          : {})}
                      >
                        <div>
                          <strong>{sale.invoice_number}</strong>
                          <span>{formatDateTime(sale.created_at)}</span>
                        </div>
                        <span className="activity-amount">
                          {formatCurrency(sale.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </div>

          <article className="panel active-panel">
            <div className="panel-header">
              <div>
                <h2>Servis Aktif</h2>
                <p>Kendaraan yang masih menunggu atau dikerjakan.</p>
              </div>
              {canServices && (
                <Link className="text-link" to="/services">
                  Lihat semua
                </Link>
              )}
            </div>

            {summary.active_services.length === 0 ? (
              <p className="empty-text">Tidak ada servis aktif.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table compact-table">
                  <thead>
                    <tr>
                      <th>No. Servis</th>
                      <th>Pelanggan</th>
                      <th>Kendaraan</th>
                      <th>Status</th>
                      <th>Masuk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.active_services.map((service) => (
                      <tr
                        key={service.id}
                        {...rowNavigation(
                          canServices
                            ? `/services?service=${service.id}`
                            : null,
                        )}
                      >
                        <td className="mono">
                          {canServices ? (
                            <Link
                              className="row-link"
                              to={`/services?service=${service.id}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {service.service_number}
                            </Link>
                          ) : (
                            service.service_number
                          )}
                        </td>
                        <td>{service.customer_name}</td>
                        <td className="mono">{service.vehicle_plate}</td>
                        <td>
                          <StatusBadge
                            status={service.status}
                            label={serviceStatusLabels[service.status]}
                          />
                        </td>
                        <td>{formatDateTime(service.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  )
}
