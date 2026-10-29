import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import PageHeader from '../components/PageHeader'
import SalesTrendChart from '../components/SalesTrendChart'
import ServiceTrafficChart from '../components/ServiceTrafficChart'
import Sparkline from '../components/Sparkline'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { getDashboardSummary } from '../services/dashboard'
import type { DashboardSummary, Role } from '../types'
import { percentChange } from '../utils/chart'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  serviceStatusLabels,
} from '../utils/format'

interface FeatureLink {
  path: string
  icon: string
  title: string
  description: string
  tone: string
  roles: Role[]
}

const featureLinks: FeatureLink[] = [
  {
    path: '/inventory',
    icon: '▦',
    title: 'Inventaris',
    description: 'Stok spare part, harga, dan riwayat pergerakan.',
    tone: 'blue',
    roles: ['owner', 'admin', 'mekanik', 'staff'],
  },
  {
    path: '/sales',
    icon: '↗',
    title: 'Penjualan',
    description: 'Kasir cepat, diskon, dan invoice otomatis.',
    tone: 'green',
    roles: ['owner', 'admin'],
  },
  {
    path: '/services',
    icon: '⚙',
    title: 'Servis Bengkel',
    description: 'Antrian kendaraan dan progres pengerjaan.',
    tone: 'amber',
    roles: ['owner', 'admin', 'mekanik'],
  },
  {
    path: '/purchases',
    icon: '▤',
    title: 'Pembelian',
    description: 'Restock dari supplier dan penambahan stok.',
    tone: 'violet',
    roles: ['owner', 'admin'],
  },
]

function greetingDate(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function DashboardPage() {
  const { user } = useAuth()
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
    lastServices.length > 0
      ? lastServices[lastServices.length - 1].total
      : 0
  const visitsYesterday =
    lastServices.length > 1
      ? lastServices[lastServices.length - 2].total
      : 0
  const visitsDelta = percentChange(visitsToday, visitsYesterday)

  const visibleFeatures = featureLinks.filter(
    (feature) => user && feature.roles.includes(user.role),
  )

  const serviceTotal = summary?.services.total ?? 0
  const serviceSegments = summary
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

  return (
    <section>
      <PageHeader
        title={`Halo, ${user?.name.split(' ')[0] ?? 'Pengguna'}`}
        description={`Ringkasan operasional bengkel · ${greetingDate()}`}
        actions={
          <>
            <Link className="button button-ghost" to="/services">
              Servis Bengkel
            </Link>
            <Link className="button button-primary" to="/sales">
              + Transaksi Baru
            </Link>
          </>
        }
      />

      {error && <div className="alert alert-error">{error}</div>}

      {loading && <div className="panel loading-row">Memuat ringkasan…</div>}

      {summary && (
        <>
          <div className="stat-grid">
            <article className="stat-card stat-card-blue">
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-blue">↗</span>
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
              <strong>{formatCurrency(summary.sales.today_total)}</strong>
              <small>{summary.sales.today_count} transaksi</small>
              <Sparkline
                values={lastSales.map((point) => point.total)}
                tone="blue"
              />
            </article>

            <article className="stat-card stat-card-amber">
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-amber">⚙</span>
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
              <strong>{formatNumber(activeServiceCount)}</strong>
              <small>
                {summary.services.pending} menunggu ·{' '}
                {summary.services.in_progress} dikerjakan
              </small>
              <Sparkline
                values={lastServices.map((point) => point.total)}
                tone="amber"
              />
            </article>

            <article className="stat-card stat-card-red">
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-red">▦</span>
                <span className="trend-pill trend-pill-neutral">
                  {summary.products.total} produk
                </span>
              </div>
              <p>Stok menipis</p>
              <strong>{formatNumber(summary.products.low_stock)}</strong>
              <small>{summary.products.out_of_stock} produk habis</small>
              <div className="stat-meter" aria-hidden="true">
                <span style={{ width: `${lowStockShare}%` }} />
              </div>
            </article>

            <article className="stat-card stat-card-green">
              <div className="stat-card-top">
                <span className="stat-icon stat-icon-green">▤</span>
                <span className="trend-pill trend-pill-neutral">
                  {summary.purchases.month_count} pembelian
                </span>
              </div>
              <p>Pembelian bulan ini</p>
              <strong>{formatCurrency(summary.purchases.month_total)}</strong>
              <small>
                {summary.purchases.today_count} pembelian hari ini
              </small>
            </article>
          </div>

          {visibleFeatures.length > 0 && (
            <section className="feature-section">
              <div className="section-head">
                <div>
                  <h2>Akses cepat</h2>
                  <p>Semua fitur utama bengkel dalam satu klik.</p>
                </div>
              </div>

              <div className="feature-grid">
                {visibleFeatures.map((feature) => (
                  <Link
                    key={feature.path}
                    to={feature.path}
                    className={`feature-card feature-card-${feature.tone}`}
                  >
                    <span className="feature-icon">{feature.icon}</span>
                    <div>
                      <strong>{feature.title}</strong>
                      <p>{feature.description}</p>
                    </div>
                    <span className="feature-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="chart-grid">
            <SalesTrendChart points={salesTrend} />
            <ServiceTrafficChart points={serviceTrend} />
          </div>

          <div className="dashboard-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Status Servis</h2>
                  <p>Distribusi pekerjaan servis saat ini.</p>
                </div>
                <Link className="text-link" to="/services">
                  Kelola
                </Link>
              </div>

              <div className="service-overview">
                <div
                  className="donut-chart"
                  style={{ background: `conic-gradient(${donutStops})` }}
                  role="img"
                  aria-label={`Total ${serviceTotal} servis`}
                >
                  <div className="donut-center">
                    <strong>{serviceTotal}</strong>
                    <span>total servis</span>
                  </div>
                </div>

                <ul className="donut-legend">
                  {serviceSegments.map((segment) => (
                    <li key={segment.key}>
                      <span
                        className="status-dot"
                        style={{ background: segment.color }}
                      />
                      <span className="donut-legend-label">
                        {segment.label}
                      </span>
                      <strong>{segment.value}</strong>
                      <small>
                        {serviceTotal > 0
                          ? `${((segment.value / serviceTotal) * 100).toFixed(
                              0,
                            )}%`
                          : '0%'}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="panel-note">
                {summary.services.unpaid} servis belum lunas.
              </p>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Ringkasan Penjualan</h2>
                  <p>Akumulasi transaksi yang sudah selesai.</p>
                </div>
                <Link className="text-link" to="/sales">
                  Lihat semua
                </Link>
              </div>

              <dl className="summary-list">
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
                  <dt>Total keseluruhan</dt>
                  <dd>
                    {formatCurrency(summary.sales.total_revenue)}
                    <span>{summary.sales.total_count} transaksi</span>
                  </dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="dashboard-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Stok Menipis</h2>
                  <p>Produk dengan stok ≤ 5.</p>
                </div>
                <Link className="text-link" to="/inventory">
                  Inventaris
                </Link>
              </div>

              {summary.low_stock_products.length === 0 ? (
                <p className="empty-text">Semua stok produk aman.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Produk</th>
                        <th>SKU</th>
                        <th className="align-right">Stok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.low_stock_products.map((product) => (
                        <tr key={product.id}>
                          <td>{product.name}</td>
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

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Penjualan Terbaru</h2>
                  <p>5 transaksi terakhir.</p>
                </div>
              </div>

              {summary.recent_sales.length === 0 ? (
                <p className="empty-text">Belum ada penjualan.</p>
              ) : (
                <ul className="activity-list">
                  {summary.recent_sales.map((sale) => (
                    <li key={sale.id}>
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

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Servis Aktif</h2>
                <p>Pekerjaan yang masih menunggu atau sedang dikerjakan.</p>
              </div>
              <Link className="text-link" to="/services">
                Lihat semua
              </Link>
            </div>

            {summary.active_services.length === 0 ? (
              <p className="empty-text">Tidak ada servis aktif.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
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
                      <tr key={service.id}>
                        <td className="mono">{service.service_number}</td>
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
