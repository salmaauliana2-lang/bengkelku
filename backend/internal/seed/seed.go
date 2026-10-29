// Package seed mengisi database dengan data demo yang siap dipakai
// untuk presentasi: katalog spare part, pengguna, pembelian, penjualan,
// servis, pembayaran, dan pergerakan stok selama 7 hari terakhir.
//
// Seed hanya dijalankan ketika tabel products masih kosong sehingga
// tidak menimpa data asli. Nonaktifkan dengan SEED_DEMO_DATA=false.
package seed

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed data/spareparts.json
var sparepartsJSON []byte

// ProductSeed adalah satu baris katalog spare part pada file JSON.
type ProductSeed struct {
	SKU           string `json:"sku"`
	Name          string `json:"name"`
	Category      string `json:"category"`
	PurchasePrice int64  `json:"purchase_price"`
	SellingPrice  int64  `json:"selling_price"`
	Stock         int    `json:"stock"`
}

type catalog struct {
	Products []ProductSeed `json:"products"`
}

type demoUser struct {
	Name     string
	Email    string
	Password string
	Role     string
}

// Akun demo yang dibuat otomatis. Password sengaja sederhana agar
// mudah ditampilkan saat presentasi.
var demoUsers = []demoUser{
	{Name: "Auliana Putri", Email: "owner@bengkelku.id", Password: "owner123", Role: "owner"},
	{Name: "Bagas Prakoso", Email: "admin@bengkelku.id", Password: "admin123", Role: "admin"},
	{Name: "Budi Santoso", Email: "budi@bengkelku.id", Password: "mekanik123", Role: "mekanik"},
	{Name: "Rahmat Hidayat", Email: "rahmat@bengkelku.id", Password: "mekanik123", Role: "mekanik"},
	{Name: "Siti Aminah", Email: "staff@bengkelku.id", Password: "staff123", Role: "staff"},
}

type product struct {
	ProductSeed
	ID int64
}

type line struct {
	SKU string
	Qty int
}

type purchasePlan struct {
	at       time.Time
	supplier string
	notes    string
	items    []line
}

type salePlan struct {
	at    time.Time
	notes string
	items []line
}

type servicePlan struct {
	at        time.Time
	customer  string
	phone     string
	plate     string
	vehicle   string
	complaint string
	diagnosis string
	mechanic  string
	laborCost int64
	status    string
	paid      bool
	notes     string
	parts     []line
}

type event struct {
	at       time.Time
	kind     string
	purchase *purchasePlan
	sale     *salePlan
	service  *servicePlan
}

// RunIfEmpty menjalankan seed hanya jika belum ada produk sama sekali.
func RunIfEmpty(ctx context.Context, db *pgxpool.Pool) (bool, error) {
	var count int

	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM products`).Scan(&count); err != nil {
		return false, fmt.Errorf("gagal memeriksa data produk: %w", err)
	}

	if count > 0 {
		return false, nil
	}

	if err := Run(ctx, db); err != nil {
		return false, err
	}

	return true, nil
}

// Run membuat seluruh data demo dalam satu transaksi.
func Run(ctx context.Context, db *pgxpool.Pool) error {
	products, err := loadCatalog()
	if err != nil {
		return err
	}

	purchases.reset()
	salesNumbers.reset()
	serviceNumbers.reset()

	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var count int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM products`).Scan(&count); err != nil {
			return fmt.Errorf("gagal memeriksa data produk: %w", err)
		}
		if count > 0 {
			return nil
		}

		userIDs, err := seedUsers(ctx, tx)
		if err != nil {
			return err
		}

		adminID := userIDs["admin@bengkelku.id"]

		if err := seedProducts(ctx, tx, products); err != nil {
			return err
		}

		events := buildEvents(products)

		var movementCount int
		for _, ev := range events {
			switch ev.kind {
			case "purchase":
				movements, err := applyPurchase(ctx, tx, ev.purchase, products)
				if err != nil {
					return err
				}
				movementCount += movements
			case "sale":
				movements, err := applySale(ctx, tx, ev.sale, products, adminID)
				if err != nil {
					return err
				}
				movementCount += movements
			case "service":
				movements, err := applyService(ctx, tx, ev.service, products)
				if err != nil {
					return err
				}
				movementCount += movements
			}
		}

		if err := persistStock(ctx, tx, products); err != nil {
			return err
		}

		log.Printf(
			"seed: %d produk, %d pengguna, %d event transaksi, %d pergerakan stok",
			len(products), len(demoUsers), len(events), movementCount,
		)

		return nil
	})
}

func loadCatalog() ([]*product, error) {
	var data catalog

	if err := json.Unmarshal(sparepartsJSON, &data); err != nil {
		return nil, fmt.Errorf("gagal membaca katalog spare part: %w", err)
	}

	if len(data.Products) < 50 {
		return nil, fmt.Errorf(
			"katalog spare part minimal 50 produk, ditemukan %d",
			len(data.Products),
		)
	}

	seen := make(map[string]bool, len(data.Products))
	result := make([]*product, 0, len(data.Products))

	for _, item := range data.Products {
		item.SKU = strings.TrimSpace(item.SKU)
		item.Name = strings.TrimSpace(item.Name)
		item.Category = strings.TrimSpace(item.Category)

		if item.SKU == "" || item.Name == "" {
			return nil, errors.New("katalog berisi SKU atau nama produk kosong")
		}
		if seen[item.SKU] {
			return nil, fmt.Errorf("SKU duplikat pada katalog: %s", item.SKU)
		}
		if item.PurchasePrice < 0 || item.SellingPrice < 0 || item.Stock < 0 {
			return nil, fmt.Errorf("nilai harga/stok %s tidak valid", item.SKU)
		}
		if item.SellingPrice < item.PurchasePrice {
			return nil, fmt.Errorf(
				"harga jual %s lebih rendah dari harga beli",
				item.SKU,
			)
		}

		seen[item.SKU] = true
		copy := item
		result = append(result, &product{ProductSeed: copy})
	}

	return result, nil
}

func seedUsers(ctx context.Context, tx pgx.Tx) (map[string]int64, error) {
	ids := make(map[string]int64, len(demoUsers))

	for _, user := range demoUsers {
		hash, err := bcrypt.GenerateFromPassword(
			[]byte(user.Password),
			bcrypt.DefaultCost,
		)
		if err != nil {
			return nil, fmt.Errorf("gagal membuat hash password: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO users (
				name, email, password_hash, role, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, NOW() - INTERVAL '120 days', NOW())
			ON CONFLICT (email) DO NOTHING
		`, user.Name, user.Email, string(hash), user.Role); err != nil {
			return nil, fmt.Errorf("gagal membuat pengguna demo: %w", err)
		}

		var id int64
		if err := tx.QueryRow(
			ctx,
			`SELECT id FROM users WHERE email = $1`,
			user.Email,
		).Scan(&id); err != nil {
			return nil, fmt.Errorf("gagal membaca pengguna demo: %w", err)
		}

		ids[user.Email] = id
	}

	return ids, nil
}

func seedProducts(
	ctx context.Context,
	tx pgx.Tx,
	products []*product,
) error {
	now := time.Now()

	for index, item := range products {
		createdAt := now.AddDate(0, 0, -(45 + index%30))

		err := tx.QueryRow(ctx, `
			INSERT INTO products (
				name, sku, category, purchase_price, selling_price,
				stock, is_active, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
			RETURNING id
		`,
			item.Name,
			item.SKU,
			item.Category,
			item.PurchasePrice,
			item.SellingPrice,
			item.Stock,
			createdAt,
			createdAt,
		).Scan(&item.ID)
		if err != nil {
			return fmt.Errorf("gagal membuat produk %s: %w", item.SKU, err)
		}
	}

	return nil
}

// buildEvents membuat seluruh transaksi 7 hari terakhir (hari ini dan
// 6 hari sebelumnya), lalu mengurutkannya berdasarkan waktu.
func buildEvents(products []*product) []event {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	eventList := make([]event, 0, 60)

	purchases := []purchasePlan{
		{
			at:       today.AddDate(0, 0, -6).Add(8*time.Hour + 30*time.Minute),
			supplier: "PT Astra Otoparts",
			notes:    "Restock oli dan filter untuk stok mingguan.",
			items: []line{
				{"OLI-001", 12},
				{"FLT-001", 20},
				{"BRK-001", 15},
				{"ENG-001", 20},
				{"ELC-004", 20},
			},
		},
		{
			at:       today.AddDate(0, 0, -3).Add(9*time.Hour + 15*time.Minute),
			supplier: "PT Federal Karyatama",
			notes:    "Pembelian oli mesin dan kampas rem.",
			items: []line{
				{"OLI-002", 10},
				{"FLT-003", 12},
				{"BRK-002", 12},
				{"TIR-001", 8},
			},
		},
		{
			at:       today.AddDate(0, 0, -1).Add(10 * time.Hour),
			supplier: "CV Sumber Jaya Motor",
			notes:    "Stok tambahan untuk servis akhir pekan.",
			items: []line{
				{"OLI-003", 24},
				{"FLT-005", 10},
				{"ELC-001", 5},
				{"SUS-006", 10},
				{"BDY-003", 8},
			},
		},
	}

	for index := range purchases {
		plan := purchases[index]
		eventList = append(eventList, event{
			at:       plan.at,
			kind:     "purchase",
			purchase: &plan,
		})
	}

	salePlans := buildSales(today, now)
	for index := range salePlans {
		plan := salePlans[index]
		eventList = append(eventList, event{
			at:   plan.at,
			kind: "sale",
			sale: &plan,
		})
	}

	servicePlans := buildServices(today, now)
	for index := range servicePlans {
		plan := servicePlans[index]
		eventList = append(eventList, event{
			at:      plan.at,
			kind:    "service",
			service: &plan,
		})
	}

	sort.SliceStable(eventList, func(i, j int) bool {
		return eventList[i].at.Before(eventList[j].at)
	})

	return eventList
}

func buildSales(today time.Time, now time.Time) []salePlan {
	fastMoving := []string{
		"OLI-003", "OLI-004", "OLI-006", "OLI-008",
		"FLT-001", "FLT-002", "FLT-003",
		"BRK-001", "BRK-002", "BRK-006",
		"ENG-001", "ENG-003", "ENG-010",
		"ELC-004", "TIR-004", "TIR-005", "BDY-006",
	}

	rnd := rand.New(rand.NewSource(20261029))
	sales := make([]salePlan, 0, 40)

	for dayOffset := -6; dayOffset <= 0; dayOffset++ {
		day := today.AddDate(0, 0, dayOffset)
		perDay := 4 + rnd.Intn(3)
		startHour := 8
		startMinute := 15

		for i := 0; i < perDay; i++ {
			at := day.Add(
				time.Duration(startHour)*time.Hour +
					time.Duration(startMinute+i*75+rnd.Intn(20))*time.Minute,
			)

			if dayOffset == 0 && at.After(now) {
				at = now.Add(
					-time.Duration((perDay-i)*35+rnd.Intn(10)) * time.Minute,
				)
				if at.Before(day) {
					at = day.Add(time.Duration(5+i*3) * time.Minute)
				}
			}

			itemCount := 1 + rnd.Intn(2)
			items := make([]line, 0, itemCount)
			used := make(map[string]bool, itemCount)

			for len(items) < itemCount {
				sku := fastMoving[rnd.Intn(len(fastMoving))]
				if used[sku] {
					continue
				}
				used[sku] = true
				items = append(items, line{SKU: sku, Qty: 1 + rnd.Intn(2)})
			}

			notes := ""
			if rnd.Intn(3) == 0 {
				notes = "Pembelian langsung pelanggan."
			}

			sales = append(sales, salePlan{at: at, notes: notes, items: items})
		}
	}

	return sales
}

func buildServices(today time.Time, now time.Time) []servicePlan {
	specs := []servicePlan{
		{
			at:        today.AddDate(0, 0, -6).Add(9 * time.Hour),
			customer:  "Andi Pratama",
			phone:     "081234567801",
			plate:     "B 1234 XYZ",
			vehicle:   "Honda Beat 2019",
			complaint: "Motor sulit dinyalakan saat pagi.",
			diagnosis: "Busi dan filter oli sudah waktunya diganti.",
			mechanic:  "Budi Santoso",
			laborCost: 75000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"FLT-001", 1}, {"ENG-001", 1}},
		},
		{
			at:        today.AddDate(0, 0, -6).Add(13*time.Hour + 30*time.Minute),
			customer:  "Siti Rahayu",
			phone:     "081234567802",
			plate:     "B 8899 ABC",
			vehicle:   "Toyota Avanza 2017",
			complaint: "Rem berbunyi saat kendaraan mengerem.",
			diagnosis: "Kampas rem depan aus dan perlu diganti.",
			mechanic:  "Rahmat Hidayat",
			laborCost: 100000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"BRK-003", 1}},
		},
		{
			at:        today.AddDate(0, 0, -5).Add(10*time.Hour + 15*time.Minute),
			customer:  "Rizky Maulana",
			phone:     "081234567803",
			plate:     "B 5678 DEF",
			vehicle:   "Yamaha NMAX 2021",
			complaint: "Servis rutin 10.000 km.",
			diagnosis: "Servis rutin, kondisi mesin masih baik.",
			mechanic:  "Budi Santoso",
			laborCost: 90000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"OLI-004", 1}, {"FLT-007", 1}},
		},
		{
			at:        today.AddDate(0, 0, -5).Add(15 * time.Hour),
			customer:  "Dewi Lestari",
			phone:     "081234567804",
			plate:     "B 4321 GHI",
			vehicle:   "Honda Vario 125 2020",
			complaint: "Motor bergetar saat tarikan awal.",
			diagnosis: "V-belt mulai retak dan roller sudah aus.",
			mechanic:  "Rahmat Hidayat",
			laborCost: 80000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"ENG-003", 1}, {"ENG-004", 1}},
		},
		{
			at:        today.AddDate(0, 0, -4).Add(9*time.Hour + 45*time.Minute),
			customer:  "Agus Setiawan",
			phone:     "081234567805",
			plate:     "B 7766 JKL",
			vehicle:   "Daihatsu Xenia 2018",
			complaint: "AC kurang dingin saat siang hari.",
			diagnosis: "Filter kabin kotor dan aliran udara terhambat.",
			mechanic:  "Budi Santoso",
			laborCost: 150000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"FLT-006", 1}},
		},
		{
			at:        today.AddDate(0, 0, -4).Add(14*time.Hour + 30*time.Minute),
			customer:  "Putri Anggraini",
			phone:     "081234567806",
			plate:     "B 3344 MNO",
			vehicle:   "Suzuki Ertiga 2019",
			complaint: "Setir bergetar di kecepatan tinggi.",
			diagnosis: "Tie rod end oblak, perlu penggantian.",
			mechanic:  "Rahmat Hidayat",
			laborCost: 120000,
			status:    "completed",
			paid:      false,
			parts:     []line{{"SUS-005", 1}},
		},
		{
			at:        today.AddDate(0, 0, -3).Add(9*time.Hour + 30*time.Minute),
			customer:  "Hendra Wijaya",
			phone:     "081234567807",
			plate:     "B 1122 PQR",
			vehicle:   "Honda Supra X 2015",
			complaint: "Rantai mesin berisik saat berjalan.",
			diagnosis: "Rantai keteng aus dan perlu diganti.",
			mechanic:  "Budi Santoso",
			laborCost: 60000,
			status:    "completed",
			paid:      false,
			parts:     []line{{"ENG-005", 1}},
		},
		{
			at:        today.AddDate(0, 0, -3).Add(13 * time.Hour),
			customer:  "Nina Marlina",
			phone:     "081234567808",
			plate:     "B 9988 STU",
			vehicle:   "Yamaha Mio 2016",
			complaint: "Lampu depan mati total.",
			diagnosis: "Lampu LED putus, menunggu konfirmasi pelanggan.",
			mechanic:  "Rahmat Hidayat",
			laborCost: 50000,
			status:    "in_progress",
			parts:     []line{{"ELC-003", 1}},
		},
		{
			at:        today.AddDate(0, 0, -2).Add(10 * time.Hour),
			customer:  "Bayu Saputra",
			phone:     "081234567809",
			plate:     "B 6655 VWX",
			vehicle:   "Suzuki Satria 2014",
			complaint: "Rem belakang tidak pakem.",
			diagnosis: "Kampas rem tromol tipis, sedang dikerjakan.",
			mechanic:  "Budi Santoso",
			laborCost: 55000,
			status:    "in_progress",
			parts:     []line{{"BRK-006", 1}},
		},
		{
			at:        today.AddDate(0, 0, -2).Add(16 * time.Hour),
			customer:  "Rina Kurniasih",
			phone:     "081234567810",
			plate:     "B 2211 YZA",
			vehicle:   "Honda Brio 2020",
			complaint: "Servis rutin bulanan.",
			diagnosis: "Servis rutin, semua kondisi normal.",
			mechanic:  "Rahmat Hidayat",
			laborCost: 200000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"OLI-002", 1}, {"FLT-002", 1}},
		},
		{
			at:        today.AddDate(0, 0, -1).Add(9*time.Hour + 15*time.Minute),
			customer:  "Fajar Nugroho",
			phone:     "081234567811",
			plate:     "B 5544 BCD",
			vehicle:   "Toyota Avanza 2016",
			complaint: "Suhu mesin naik saat macet.",
			status:    "pending",
		},
		{
			at:        today.AddDate(0, 0, -1).Add(11*time.Hour + 30*time.Minute),
			customer:  "Lina Marlina",
			phone:     "081234567812",
			plate:     "B 7799 NOP",
			vehicle:   "Honda Vario 2018",
			complaint: "Servis berkala, pelanggan membatalkan.",
			status:    "cancelled",
			notes:     "Pelanggan membatalkan servis karena urusan mendadak.",
		},
		{
			at:        today.AddDate(0, 0, -1).Add(14*time.Hour + 45*time.Minute),
			customer:  "Maya Sari",
			phone:     "081234567813",
			plate:     "B 8877 EFG",
			vehicle:   "Honda Beat 2020",
			complaint: "Ban depan bocor.",
			diagnosis: "Ban dalam bocor dan sudah diganti.",
			mechanic:  "Budi Santoso",
			laborCost: 30000,
			status:    "completed",
			paid:      true,
			parts:     []line{{"TIR-004", 1}},
		},
		{
			at:        today.Add(8*time.Hour + 30*time.Minute),
			customer:  "Yoga Pratama",
			phone:     "081234567814",
			plate:     "B 4455 HIJ",
			vehicle:   "Yamaha NMAX 2022",
			complaint: "Motor berbunyi kasar saat digas.",
			status:    "pending",
		},
		{
			at:        today.Add(9*time.Hour + 45*time.Minute),
			customer:  "Indra Gunawan",
			phone:     "081234567815",
			plate:     "B 3322 KLM",
			vehicle:   "Daihatsu Xenia 2019",
			complaint: "Kaki-kaki berbunyi saat melewati jalan rusak.",
			diagnosis: "Ball joint aus, sedang dalam pengerjaan.",
			mechanic:  "Rahmat Hidayat",
			laborCost: 100000,
			status:    "in_progress",
			parts:     []line{{"SUS-004", 1}},
		},
	}

	result := make([]servicePlan, 0, len(specs))

	for _, spec := range specs {
		if spec.at.After(now) {
			spec.at = now.Add(-45 * time.Minute)
			if spec.at.Before(today) {
				spec.at = today.Add(10 * time.Minute)
			}
		}

		if spec.status == "cancelled" {
			spec.laborCost = 0
			spec.parts = nil
		}

		result = append(result, spec)
	}

	return result
}

func applyPurchase(
	ctx context.Context,
	tx pgx.Tx,
	plan *purchasePlan,
	products []*product,
) (int, error) {
	bySKU := productsBySKU(products)

	var subtotal int64
	valid := make([]line, 0, len(plan.items))

	for _, item := range plan.items {
		p, ok := bySKU[item.SKU]
		if !ok || item.Qty <= 0 {
			continue
		}
		subtotal += p.PurchasePrice * int64(item.Qty)
		valid = append(valid, item)
	}

	if len(valid) == 0 {
		return 0, nil
	}

	invoice := nextNumber(purchases, plan.at)
	purchaseID, err := nextID(ctx, tx, `
		INSERT INTO purchases (
			invoice_number, supplier_name, subtotal, notes,
			created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $5)
		RETURNING id
	`, invoice, plan.supplier, subtotal, nullable(plan.notes), plan.at)
	if err != nil {
		return 0, fmt.Errorf("gagal membuat pembelian: %w", err)
	}

	movements := 0

	for _, item := range valid {
		p := bySKU[item.SKU]
		before := p.Stock
		after := before + item.Qty

		if _, err := tx.Exec(ctx, `
			INSERT INTO purchase_items (
				purchase_id, product_id, quantity, unit_cost, created_at
			)
			VALUES ($1, $2, $3, $4, $5)
		`, purchaseID, p.ID, item.Qty, p.PurchasePrice, plan.at); err != nil {
			return 0, fmt.Errorf("gagal menyimpan item pembelian: %w", err)
		}

		p.Stock = after
		movements++

		if err := insertMovement(
			ctx, tx, nil, p.ID, "in", item.Qty, before, after,
			"Pembelian "+invoice, plan.at,
		); err != nil {
			return 0, err
		}
	}

	return movements, nil
}

func applySale(
	ctx context.Context,
	tx pgx.Tx,
	plan *salePlan,
	products []*product,
	userID int64,
) (int, error) {
	bySKU := productsBySKU(products)

	type appliedItem struct {
		product *product
		qty     int
		price   int64
	}

	applied := make([]appliedItem, 0, len(plan.items))
	var subtotal int64

	for _, item := range plan.items {
		p, ok := bySKU[item.SKU]
		if !ok || item.Qty <= 0 || p.Stock < item.Qty {
			continue
		}

		applied = append(applied, appliedItem{
			product: p,
			qty:     item.Qty,
			price:   p.SellingPrice,
		})
		subtotal += p.SellingPrice * int64(item.Qty)
	}

	if len(applied) == 0 {
		return 0, nil
	}

	invoice := nextNumber(salesNumbers, plan.at)
	saleID, err := nextID(ctx, tx, `
		INSERT INTO sales (
			user_id, invoice_number, subtotal, discount, total,
			payment_method, status, notes, created_at, updated_at
		)
		VALUES ($1, $2, $3, 0, $3, 'cash', 'completed', $4, $5, $5)
		RETURNING id
	`, userID, invoice, subtotal, nullable(plan.notes), plan.at)
	if err != nil {
		return 0, fmt.Errorf("gagal membuat penjualan: %w", err)
	}

	movements := 0

	for _, item := range applied {
		p := item.product
		before := p.Stock
		after := before - item.qty

		if _, err := tx.Exec(ctx, `
			INSERT INTO sale_items (
				sale_id, product_id, quantity, unit_price, subtotal, created_at
			)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, saleID, p.ID, item.qty, item.price, item.price*int64(item.qty), plan.at); err != nil {
			return 0, fmt.Errorf("gagal menyimpan item penjualan: %w", err)
		}

		p.Stock = after
		movements++

		if err := insertMovement(
			ctx, tx, &userID, p.ID, "out", item.qty, before, after,
			"Penjualan "+invoice, plan.at,
		); err != nil {
			return 0, err
		}
	}

	return movements, nil
}

func applyService(
	ctx context.Context,
	tx pgx.Tx,
	plan *servicePlan,
	products []*product,
) (int, error) {
	bySKU := productsBySKU(products)

	type appliedPart struct {
		product *product
		qty     int
	}

	parts := make([]appliedPart, 0, len(plan.parts))
	var partsCost int64

	for _, item := range plan.parts {
		p, ok := bySKU[item.SKU]
		if !ok || item.Qty <= 0 || p.Stock < item.Qty {
			continue
		}
		parts = append(parts, appliedPart{product: p, qty: item.Qty})
		partsCost += p.SellingPrice * int64(item.Qty)
	}

	totalCost := plan.laborCost + partsCost
	paymentStatus := "unpaid"
	if plan.paid && plan.status == "completed" && totalCost > 0 {
		paymentStatus = "paid"
	}

	number := nextNumber(serviceNumbers, plan.at)
	updatedAt := plan.at.Add(30 * time.Minute)

	serviceID, err := nextID(ctx, tx, `
		INSERT INTO services (
			service_number, customer_name, customer_phone,
			vehicle_plate, vehicle_brand, complaint, diagnosis,
			mechanic_name, labor_cost, parts_cost, total_cost,
			status, payment_status, notes, created_at, updated_at
		)
		VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16
		)
		RETURNING id
	`,
		number,
		plan.customer,
		nullable(plan.phone),
		plan.plate,
		nullable(plan.vehicle),
		plan.complaint,
		nullable(plan.diagnosis),
		nullable(plan.mechanic),
		plan.laborCost,
		partsCost,
		totalCost,
		plan.status,
		paymentStatus,
		nullable(plan.notes),
		plan.at,
		updatedAt,
	)
	if err != nil {
		return 0, fmt.Errorf("gagal membuat servis: %w", err)
	}

	movements := 0

	for _, part := range parts {
		p := part.product
		before := p.Stock
		after := before - part.qty

		if _, err := tx.Exec(ctx, `
			INSERT INTO service_parts (
				service_id, product_id, quantity,
				unit_cost, unit_price, created_at
			)
			VALUES ($1, $2, $3, $4, $5, $6)
		`,
			serviceID,
			p.ID,
			part.qty,
			p.PurchasePrice,
			p.SellingPrice,
			plan.at,
		); err != nil {
			return 0, fmt.Errorf("gagal menyimpan spare part servis: %w", err)
		}

		p.Stock = after
		movements++

		if err := insertMovement(
			ctx, tx, nil, p.ID, "out", part.qty, before, after,
			"Penggunaan spare part "+number, plan.at,
		); err != nil {
			return 0, err
		}
	}

	if paymentStatus == "paid" {
		paidAt := plan.at.Add(2 * time.Hour)
		if paidAt.After(time.Now()) {
			paidAt = time.Now()
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO service_payments (
				service_id, amount, payment_method, paid_at,
				notes, created_at
			)
			VALUES ($1, $2, 'cash', $3, $4, $3)
		`,
			serviceID,
			totalCost,
			paidAt,
			"Pembayaran tunai "+number,
		); err != nil {
			return 0, fmt.Errorf("gagal menyimpan pembayaran servis: %w", err)
		}
	}

	return movements, nil
}

func insertMovement(
	ctx context.Context,
	tx pgx.Tx,
	userID *int64,
	productID int64,
	movementType string,
	quantity int,
	before int,
	after int,
	notes string,
	at time.Time,
) error {
	if _, err := tx.Exec(ctx, `
		INSERT INTO stock_movements (
			user_id, product_id, movement_type, quantity,
			stock_before, stock_after, notes, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`,
		userID,
		productID,
		movementType,
		quantity,
		before,
		after,
		notes,
		at,
	); err != nil {
		return fmt.Errorf("gagal mencatat pergerakan stok: %w", err)
	}

	return nil
}

func persistStock(
	ctx context.Context,
	tx pgx.Tx,
	products []*product,
) error {
	for _, p := range products {
		if _, err := tx.Exec(ctx, `
			UPDATE products
			SET stock = $1, updated_at = NOW()
			WHERE id = $2
		`, p.Stock, p.ID); err != nil {
			return fmt.Errorf("gagal menyimpan stok %s: %w", p.SKU, err)
		}
	}

	return nil
}

func productsBySKU(products []*product) map[string]*product {
	result := make(map[string]*product, len(products))
	for _, p := range products {
		result[p.SKU] = p
	}
	return result
}

// nextNumber membuat nomor dokumen berurutan per hari, misalnya
// INV-20261029-01. Penomoran disimpan per prefix agar tidak bentrok.
var (
	purchases      = &numberer{prefix: "PO"}
	salesNumbers   = &numberer{prefix: "INV"}
	serviceNumbers = &numberer{prefix: "SVC"}
)

type numberer struct {
	prefix string
	counts map[string]int
}

func (n *numberer) next(at time.Time) string {
	if n.counts == nil {
		n.counts = make(map[string]int)
	}

	day := at.Format("20060102")
	n.counts[day]++

	return fmt.Sprintf("%s-%s-%02d", n.prefix, day, n.counts[day])
}

func (n *numberer) reset() {
	n.counts = make(map[string]int)
}

func nextNumber(numberer *numberer, at time.Time) string {
	return numberer.next(at)
}

func nextID(
	ctx context.Context,
	tx pgx.Tx,
	query string,
	args ...any,
) (int64, error) {
	var id int64
	if err := tx.QueryRow(ctx, query, args...).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

func nullable(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
