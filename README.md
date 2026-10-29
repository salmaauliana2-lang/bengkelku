# Workshop Management System (Tugas Akhir)

Backend Go (Gin + PostgreSQL) dan frontend statis untuk manajemen bengkel:
inventaris, pembelian, penjualan, dan servis.

## Menjalankan backend

```bash
# Buat database sekali saja (sesuaikan user PostgreSQL Anda).
createdb -U postgres workshop_db

cd backend
cp .env.example .env      # lalu isi DATABASE_URL dan JWT_SECRET (>= 32 karakter)
go mod tidy
go run ./cmd/main
```

Migrasi database dijalankan otomatis saat server start. Migration
`010_add_user_references.sql` menambahkan kolom `user_id` yang dipakai
modul penjualan pada `sales` dan `stock_movements`.

## Data demo siap presentasi

Saat database masih kosong, backend otomatis mengisi data demo 7 hari
terakhir (hari ini dan 6 hari sebelumnya):

- **56 jenis spare part** pada file
  [`backend/internal/seed/data/spareparts.json`](backend/internal/seed/data/spareparts.json),
  lengkap dengan SKU, kategori, harga beli, harga jual, dan stok awal.
- **5 akun pengguna** dengan role berbeda.
- **3 pembelian** dari supplier berbeda beserta item dan pergerakan stok.
- **35 transaksi penjualan** dengan 54 item.
- **15 pekerjaan servis** (menunggu, dikerjakan, selesai, dibatalkan)
  berikut spare part yang dipakai dan 7 pembayaran tunai.
- **84 pergerakan stok** (masuk/keluar) yang konsisten dengan stok akhir.

Data demo langsung tampil di dashboard, inventaris, riwayat stok,
penjualan, servis, pembelian, dan halaman pengguna.

### Dashboard bergaya garage

Halaman dashboard memakai tema bengkel: sidebar karbon, aksen safety
orange, jam workshop yang berjalan, serta animasi masuk yang halus
(otomatis dimatikan bila pengguna mengaktifkan *reduced motion*).

- **Semua fitur bisa diklik** — kartu statistik, tile akses cepat, baris
  tabel, legenda donut, dan tombol grafik langsung berpindah halaman
  tanpa muat ulang (React Router).
- **Deep link** — misalnya `/inventory?q=ENG-008`, `/sales?sale=35`,
  `/services?service=8`, dan `/services?status=completed`, sehingga
  detail atau filter langsung terbuka saat halaman dimuat.
- **Grafik penjualan** — omzet harian dengan area gradien, tooltip, dan
  pilihan rentang 7 atau 30 hari.
- **Grafik traffic servis** — jumlah kendaraan masuk dan selesai per hari
  beserta rasio penyelesaian.
- **Kartu statistik** — sparkline, tren naik/turun, angka animasi, dan
  cincin distribusi status servis yang bisa difilter.
- **Layout padat** — grid 12 kolom dengan panel grafik, ringkasan, stok
  menipis, penjualan terbaru, dan servis aktif dalam satu layar.

### Akun demo

| Role    | Email                  | Password    |
|---------|------------------------|-------------|
| owner   | owner@bengkelku.id     | owner123    |
| admin   | admin@bengkelku.id     | admin123    |
| mekanik | budi@bengkelku.id      | mekanik123  |
| mekanik | rahmat@bengkelku.id    | mekanik123  |
| staff   | staff@bengkelku.id     | staff123    |

Halaman login juga menampilkan tombol akun demo yang mengisi email dan
password secara otomatis.

### Mengatur seed

- Seed aktif secara default dan **hanya berjalan jika tabel `products`
  masih kosong**, sehingga data asli tidak tertimpa.
- Nonaktifkan dengan `SEED_DEMO_DATA=false` di `backend/.env`.
- Ingin mengulang data demo? Kosongkan database (drop lalu buat ulang),
  jalankan backend kembali, dan seed akan dibuat ulang dengan tanggal
  yang mengikuti hari berjalan.

## Role pengguna

- User **pertama** yang mendaftar (`POST /api/auth/register`) otomatis menjadi `owner`.
- User berikutnya berstatus `staff` (belum punya akses modul).
- Owner mengubah role lewat `PUT /api/users/:id/role` dengan body
  `{"role": "admin"}` (pilihan: `owner`, `admin`, `mekanik`, `staff`).
  User yang diubah perlu login ulang agar token memuat role baru.

| Role    | Akses                                              |
|---------|----------------------------------------------------|
| owner   | semua modul + kelola role + daftar pengguna        |
| admin   | produk, stok, penjualan, pembelian, servis         |
| mekanik | lihat servis, ubah servis, tambah spare part       |

## Endpoint tambahan

- `GET /api/auth/me` â€” data pengguna yang sedang login.
- `GET /api/users` â€” daftar pengguna (khusus owner).
- `GET /api/purchases` dan `GET /api/purchases/:id` â€” riwayat pembelian.
- Semua endpoint daftar mendukung pagination `?page=1&limit=20`
  (limit maksimum 100) dan mengembalikan `meta` berisi `page`, `limit`,
  dan `total`.
- Login dibatasi 10 percobaan/menit per IP dan registrasi 5 percobaan/menit
  per IP.

## Frontend

Frontend (Vite + React) menjalankan halaman login dan memanggil API backend.
Jalankan dengan:

```bash
cd frontend
npm install
npm run dev
```

Untuk build produksi, gunakan `npm run build`. Hasil build di
`frontend/dist` dapat disajikan langsung oleh backend dengan mengatur
`STATIC_DIR` (lihat `Dockerfile`), sehingga aplikasi berjalan pada satu
origin tanpa konfigurasi CORS tambahan.
