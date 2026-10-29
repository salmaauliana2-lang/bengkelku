import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'
import { initials, roleLabels } from '../utils/format'

interface MenuItem {
  label: string
  path: string
  icon: string
  roles: Role[]
}

const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: '⌂',
    roles: ['owner', 'admin', 'mekanik', 'staff'],
  },
  {
    label: 'Inventaris',
    path: '/inventory',
    icon: '▦',
    roles: ['owner', 'admin', 'mekanik', 'staff'],
  },
  {
    label: 'Penjualan',
    path: '/sales',
    icon: '↗',
    roles: ['owner', 'admin'],
  },
  {
    label: 'Servis Bengkel',
    path: '/services',
    icon: '⚙',
    roles: ['owner', 'admin', 'mekanik'],
  },
  {
    label: 'Pembelian',
    path: '/purchases',
    icon: '▤',
    roles: ['owner', 'admin'],
  },
  {
    label: 'Pengguna',
    path: '/users',
    icon: '☷',
    roles: ['owner'],
  },
]

function DashboardLayout() {
  const { user, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const visibleMenu = menuItems.filter(
    (item) => user && item.roles.includes(user.role),
  )

  const activeMenu =
    visibleMenu.find((item) => location.pathname.startsWith(item.path)) ??
    visibleMenu[0]

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

  return (
    <div className="dashboard-layout">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={sidebarOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="sidebar-brand">
          <div className="brand-icon">
            <span aria-hidden="true">⚙</span>
          </div>
          <div>
            <strong>WORKSHOP PRO</strong>
            <span>Garage Control</span>
          </div>
        </div>

        <div className="garage-stripe" aria-hidden="true" />

        <p className="sidebar-heading">PIT LANE</p>

        <nav className="sidebar-nav">
          {visibleMenu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}`
              }
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot status-dot-live" />
          <span>Engine online</span>
          <small>WorkshopPro v1.0 · garage build</small>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="icon-button menu-toggle"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label="Buka menu"
            >
              ☰
            </button>
            <div>
              <span className="topbar-kicker">
                GARAGE<span>/</span>
                {activeMenu?.label ?? 'Dashboard'}
              </span>
              <p>Inventaris dan operasional bengkel motor</p>
            </div>
          </div>

          <div className="user-profile">
            <div className="user-avatar">
              {initials(user?.name ?? 'Pengguna')}
            </div>
            <div>
              <strong>{user?.name ?? 'Pengguna'}</strong>
              <span>{user ? roleLabels[user.role] : ''}</span>
            </div>
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={signOut}
            >
              Keluar
            </button>
          </div>
        </header>

        <div className="garage-stripe garage-stripe-top" aria-hidden="true" />

        <main className="page-content">
          <div className="route-view" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
