package dashboard

import "time"

type Summary struct {
	Products       ProductSummary      `json:"products"`
	Sales          SalesSummary        `json:"sales"`
	Services       ServiceSummary      `json:"services"`
	Purchases      PurchaseSummary     `json:"purchases"`
	SalesTrend     []SalesTrendPoint   `json:"sales_trend"`
	ServiceTrend   []ServiceTrendPoint `json:"service_trend"`
	LowStock       []LowStockProduct   `json:"low_stock_products"`
	RecentSales    []RecentSale        `json:"recent_sales"`
	ActiveServices []ActiveService     `json:"active_services"`
}

// SalesTrendPoint adalah total penjualan selesai pada satu tanggal.
// Date memakai format YYYY-MM-DD agar mudah dipakai grafik di frontend.
type SalesTrendPoint struct {
	Date  string `json:"date"`
	Total int64  `json:"total"`
	Count int64  `json:"count"`
}

// ServiceTrendPoint adalah jumlah kendaraan yang masuk servis pada satu
// tanggal beserta berapa di antaranya yang sudah selesai.
type ServiceTrendPoint struct {
	Date      string `json:"date"`
	Total     int64  `json:"total"`
	Completed int64  `json:"completed"`
}

type ProductSummary struct {
	Total      int64 `json:"total"`
	LowStock   int64 `json:"low_stock"`
	OutOfStock int64 `json:"out_of_stock"`
}

type SalesSummary struct {
	TodayTotal   int64 `json:"today_total"`
	TodayCount   int64 `json:"today_count"`
	MonthTotal   int64 `json:"month_total"`
	MonthCount   int64 `json:"month_count"`
	TotalRevenue int64 `json:"total_revenue"`
	TotalCount   int64 `json:"total_count"`
}

type ServiceSummary struct {
	Pending    int64 `json:"pending"`
	InProgress int64 `json:"in_progress"`
	Completed  int64 `json:"completed"`
	Cancelled  int64 `json:"cancelled"`
	Unpaid     int64 `json:"unpaid"`
	Total      int64 `json:"total"`
}

type PurchaseSummary struct {
	TodayTotal int64 `json:"today_total"`
	TodayCount int64 `json:"today_count"`
	MonthTotal int64 `json:"month_total"`
	MonthCount int64 `json:"month_count"`
	TotalCount int64 `json:"total_count"`
}

type LowStockProduct struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	SKU   string `json:"sku"`
	Stock int    `json:"stock"`
}

type RecentSale struct {
	ID            int64     `json:"id"`
	InvoiceNumber string    `json:"invoice_number"`
	Total         int64     `json:"total"`
	CreatedAt     time.Time `json:"created_at"`
}

type ActiveService struct {
	ID            int64     `json:"id"`
	ServiceNumber string    `json:"service_number"`
	CustomerName  string    `json:"customer_name"`
	VehiclePlate  string    `json:"vehicle_plate"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}
