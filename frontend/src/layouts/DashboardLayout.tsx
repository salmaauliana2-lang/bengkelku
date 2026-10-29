import { useEffect, useRef, useState } from 'react'
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
  const quickMenuRef = useRef<HTMLDetailsElement>(null)

  const visibleMenu = menuItems.filter(
    (item) => user && item.roles.includes(user.role),
  )

  const activeMenu =
    visibleMenu.find((item) => location.pathname.startsWith(item.path)) ??
    visibleMenu[0]

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

  // Tutup dropdown aksi cepat saat pindah halaman atau klik di luar menu.
  useEffect(() => {
    if (quickMenuRef.current) {
      quickMenuRef.current.open = false
    }
  }, [location.pathname])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const menu = quickMenuRef.current

      if (menu && !menu.contains(event.target as Node)) {
        menu.open = false
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

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

          <div className="topbar-tools">
            <details className="quick-menu" ref={quickMenuRef}>
              <summary className="quick-menu-trigger">
                <span className="quick-menu-bolt" aria-hidden="true">
                  ⌁
                </span>
                Aksi Cepat
                <span className="quick-menu-caret" aria-hidden="true">
                  ▾
                </span>
              </summary>

              <div className="quick-menu-panel">
                <span className="quick-menu-label">Langsung ke</span>

                {visibleMenu
                  .filter((item) => item.path !== '/dashboard')
                  .map((item, index) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className="quick-menu-link"
                      onClick={() => {
                        if (quickMenuRef.current) {
                          quickMenuRef.current.open = false
                        }
                      }}
                    >
                      <span className="quick-menu-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                      <small>{String(index + 1).padStart(2, '0')}</small>
                    </NavLink>
                  ))}
              </div>
            </details>

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
