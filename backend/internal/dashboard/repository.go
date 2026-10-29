package dashboard

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TrendDays adalah panjang data harian yang dikirim ke grafik dashboard.
const TrendDays = 30

// LowStockThreshold adalah batas stok yang dianggap menipis.
const LowStockThreshold = 5

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Summary(ctx context.Context) (Summary, error) {
	var summary Summary

	if err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE stock > 0 AND stock <= $1),
			COUNT(*) FILTER (WHERE stock = 0)
		FROM products
		WHERE is_active = TRUE
	`, LowStockThreshold).Scan(
		&summary.Products.Total,
		&summary.Products.LowStock,
		&summary.Products.OutOfStock,
	); err != nil {
		return Summary{}, fmt.Errorf("gagal menghitung ringkasan produk: %w", err)
	}

	if err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(total) FILTER (
				WHERE created_at >= CURRENT_DATE
			), 0),
			COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
			COALESCE(SUM(total) FILTER (
				WHERE created_at >= date_trunc('month', CURRENT_DATE)
			), 0),
			COUNT(*) FILTER (
				WHERE created_at >= date_trunc('month', CURRENT_DATE)
			),
			COALESCE(SUM(total), 0),
			COUNT(*)
		FROM sales
		WHERE status = 'completed'
	`).Scan(
		&summary.Sales.TodayTotal,
		&summary.Sales.TodayCount,
		&summary.Sales.MonthTotal,
		&summary.Sales.MonthCount,
		&summary.Sales.TotalRevenue,
		&summary.Sales.TotalCount,
	); err != nil {
		return Summary{}, fmt.Errorf("gagal menghitung ringkasan penjualan: %w", err)
	}

	if err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending'),
			COUNT(*) FILTER (WHERE status = 'in_progress'),
			COUNT(*) FILTER (WHERE status = 'completed'),
			COUNT(*) FILTER (WHERE status = 'cancelled'),
			COUNT(*) FILTER (
				WHERE payment_status = 'unpaid' AND status <> 'cancelled'
			),
			COUNT(*)
		FROM services
	`).Scan(
		&summary.Services.Pending,
		&summary.Services.InProgress,
		&summary.Services.Completed,
		&summary.Services.Cancelled,
		&summary.Services.Unpaid,
		&summary.Services.Total,
	); err != nil {
		return Summary{}, fmt.Errorf("gagal menghitung ringkasan servis: %w", err)
	}

	if err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(subtotal) FILTER (
				WHERE created_at >= CURRENT_DATE
			), 0),
			COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
			COALESCE(SUM(subtotal) FILTER (
				WHERE created_at >= date_trunc('month', CURRENT_DATE)
			), 0),
			COUNT(*) FILTER (
				WHERE created_at >= date_trunc('month', CURRENT_DATE)
			),
			COUNT(*)
		FROM purchases
	`).Scan(
		&summary.Purchases.TodayTotal,
		&summary.Purchases.TodayCount,
		&summary.Purchases.MonthTotal,
		&summary.Purchases.MonthCount,
		&summary.Purchases.TotalCount,
	); err != nil {
		return Summary{}, fmt.Errorf("gagal menghitung ringkasan pembelian: %w", err)
	}

	lowStock, err := r.lowStockProducts(ctx)
	if err != nil {
		return Summary{}, err
	}
	summary.LowStock = lowStock

	salesTrend, err := r.salesTrend(ctx)
	if err != nil {
		return Summary{}, err
	}
	summary.SalesTrend = salesTrend

	serviceTrend, err := r.serviceTrend(ctx)
	if err != nil {
		return Summary{}, err
	}
	summary.ServiceTrend = serviceTrend

	recentSales, err := r.recentSales(ctx)
	if err != nil {
		return Summary{}, err
	}
	summary.RecentSales = recentSales

	activeServices, err := r.activeServices(ctx)
	if err != nil {
		return Summary{}, err
	}
	summary.ActiveServices = activeServices

	return summary, nil
}

// salesTrend mengembalikan total dan jumlah transaksi selesai per hari
// selama TrendDays terakhir, termasuk hari-hari tanpa transaksi (nilai 0).
func (r *Repository) salesTrend(
	ctx context.Context,
) ([]SalesTrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		WITH days AS (
			SELECT generate_series(
				CURRENT_DATE - make_interval(days => $1 - 1),
				CURRENT_DATE,
				INTERVAL '1 day'
			)::date AS day
		)
		SELECT
			to_char(d.day, 'YYYY-MM-DD'),
			COALESCE(SUM(s.total), 0),
			COUNT(s.id)
		FROM days d
		LEFT JOIN sales s
		       ON s.created_at::date = d.day
		      AND s.status = 'completed'
		GROUP BY d.day
		ORDER BY d.day
	`, TrendDays)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil tren penjualan: %w", err)
	}
	defer rows.Close()

	trend := make([]SalesTrendPoint, 0, TrendDays)

	for rows.Next() {
		var point SalesTrendPoint

		if err := rows.Scan(
			&point.Date,
			&point.Total,
			&point.Count,
		); err != nil {
			return nil, fmt.Errorf("gagal membaca tren penjualan: %w", err)
		}

		trend = append(trend, point)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("gagal membaca hasil tren penjualan: %w", err)
	}

	return trend, nil
}

// serviceTrend mengembalikan jumlah kendaraan yang masuk servis per hari
// beserta jumlah yang sudah selesai, selama TrendDays terakhir.
func (r *Repository) serviceTrend(
	ctx context.Context,
) ([]ServiceTrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		WITH days AS (
			SELECT generate_series(
				CURRENT_DATE - make_interval(days => $1 - 1),
				CURRENT_DATE,
				INTERVAL '1 day'
			)::date AS day
		)
		SELECT
			to_char(d.day, 'YYYY-MM-DD'),
			COUNT(s.id),
			COUNT(s.id) FILTER (WHERE s.status = 'completed')
		FROM days d
		LEFT JOIN services s ON s.created_at::date = d.day
		GROUP BY d.day
		ORDER BY d.day
	`, TrendDays)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil tren servis: %w", err)
	}
	defer rows.Close()

	trend := make([]ServiceTrendPoint, 0, TrendDays)

	for rows.Next() {
		var point ServiceTrendPoint

		if err := rows.Scan(
			&point.Date,
			&point.Total,
			&point.Completed,
		); err != nil {
			return nil, fmt.Errorf("gagal membaca tren servis: %w", err)
		}

		trend = append(trend, point)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("gagal membaca hasil tren servis: %w", err)
	}

	return trend, nil
}

func (r *Repository) lowStockProducts(
	ctx context.Context,
) ([]LowStockProduct, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, sku, stock
		FROM products
		WHERE is_active = TRUE
		  AND stock <= $1
		ORDER BY stock ASC, name ASC
		LIMIT 8
	`, LowStockThreshold)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil produk stok menipis: %w", err)
	}
	defer rows.Close()

	products := make([]LowStockProduct, 0)

	for rows.Next() {
		var product LowStockProduct

		if err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.SKU,
			&product.Stock,
		); err != nil {
			return nil, fmt.Errorf("gagal membaca produk stok menipis: %w", err)
		}

		products = append(products, product)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("gagal membaca hasil produk stok menipis: %w", err)
	}

	return products, nil
}

func (r *Repository) recentSales(
	ctx context.Context,
) ([]RecentSale, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, invoice_number, total, created_at
		FROM sales
		ORDER BY created_at DESC, id DESC
		LIMIT 5
	`)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil penjualan terbaru: %w", err)
	}
	defer rows.Close()

	sales := make([]RecentSale, 0)

	for rows.Next() {
		var sale RecentSale

		if err := rows.Scan(
			&sale.ID,
			&sale.InvoiceNumber,
			&sale.Total,
			&sale.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal membaca penjualan terbaru: %w", err)
		}

		sales = append(sales, sale)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("gagal membaca hasil penjualan terbaru: %w", err)
	}

	return sales, nil
}

func (r *Repository) activeServices(
	ctx context.Context,
) ([]ActiveService, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, service_number, customer_name,
		       vehicle_plate, status, created_at
		FROM services
		WHERE status IN ('pending', 'in_progress')
		ORDER BY created_at ASC, id ASC
		LIMIT 5
	`)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil servis aktif: %w", err)
	}
	defer rows.Close()

	services := make([]ActiveService, 0)

	for rows.Next() {
		var service ActiveService

		if err := rows.Scan(
			&service.ID,
			&service.ServiceNumber,
			&service.CustomerName,
			&service.VehiclePlate,
			&service.Status,
			&service.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal membaca servis aktif: %w", err)
		}

		services = append(services, service)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("gagal membaca hasil servis aktif: %w", err)
	}

	return services, nil
}
