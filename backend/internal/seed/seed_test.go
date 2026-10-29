package seed

import (
	"testing"
	"time"
)

func TestCatalogHasEnoughUniqueProducts(t *testing.T) {
	products, err := loadCatalog()
	if err != nil {
		t.Fatalf("loadCatalog() error: %v", err)
	}

	if len(products) < 50 {
		t.Fatalf("expected at least 50 products, got %d", len(products))
	}

	seen := make(map[string]bool, len(products))

	for _, p := range products {
		if seen[p.SKU] {
			t.Fatalf("duplicate SKU: %s", p.SKU)
		}
		seen[p.SKU] = true

		if p.SellingPrice < p.PurchasePrice {
			t.Errorf("%s: selling price below purchase price", p.SKU)
		}
		if p.Stock < 0 {
			t.Errorf("%s: negative stock", p.SKU)
		}
	}
}

func TestCatalogCoversWorkshopCategories(t *testing.T) {
	products, err := loadCatalog()
	if err != nil {
		t.Fatalf("loadCatalog() error: %v", err)
	}

	categories := make(map[string]int)
	for _, p := range products {
		categories[p.Category]++
	}

	for _, required := range []string{
		"Oli & Cairan",
		"Filter",
		"Rem",
		"Mesin",
		"Kelistrikan",
		"Suspensi & Kemudi",
		"Ban & Roda",
		"Body & Aksesoris",
	} {
		if categories[required] == 0 {
			t.Errorf("category %q is empty", required)
		}
	}
}

func TestBuildEventsUsesLastSevenDays(t *testing.T) {
	products, err := loadCatalog()
	if err != nil {
		t.Fatalf("loadCatalog() error: %v", err)
	}

	events := buildEvents(products)
	if len(events) == 0 {
		t.Fatal("buildEvents() returned no events")
	}

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	oldest := today.AddDate(0, 0, -6)

	days := make(map[string]bool)
	saleCount := 0
	serviceCount := 0
	purchaseCount := 0
	previous := time.Time{}

	for _, ev := range events {
		if ev.at.Before(previous) {
			t.Fatalf("events are not sorted: %s before %s", ev.at, previous)
		}
		previous = ev.at

		if ev.at.Before(oldest) {
			t.Errorf("event older than 7 days: %s", ev.at)
		}
		if ev.at.After(now.Add(time.Hour)) {
			t.Errorf("event in the future: %s", ev.at)
		}

		days[ev.at.Format("2006-01-02")] = true

		switch ev.kind {
		case "sale":
			saleCount++
		case "service":
			serviceCount++
		case "purchase":
			purchaseCount++
		}
	}

	if saleCount < 25 {
		t.Errorf("expected at least 25 sales, got %d", saleCount)
	}
	if serviceCount < 10 {
		t.Errorf("expected at least 10 services, got %d", serviceCount)
	}
	if purchaseCount < 3 {
		t.Errorf("expected at least 3 purchases, got %d", purchaseCount)
	}
	if len(days) != 7 {
		t.Errorf("expected events on 7 distinct days, got %d", len(days))
	}
}

func TestStockNeverGoesNegative(t *testing.T) {
	products, err := loadCatalog()
	if err != nil {
		t.Fatalf("loadCatalog() error: %v", err)
	}

	bySKU := productsBySKU(products)
	stock := make(map[string]int, len(products))
	for _, p := range products {
		stock[p.SKU] = p.Stock
	}

	for _, ev := range buildEvents(products) {
		var lines []line

		switch ev.kind {
		case "purchase":
			lines = ev.purchase.items
			for _, item := range lines {
				stock[item.SKU] += item.Qty
			}
		case "sale":
			lines = ev.sale.items
			for _, item := range lines {
				if stock[item.SKU] >= item.Qty {
					stock[item.SKU] -= item.Qty
				}
			}
		case "service":
			lines = ev.service.parts
			for _, item := range lines {
				if stock[item.SKU] >= item.Qty {
					stock[item.SKU] -= item.Qty
				}
			}
		}

		for _, item := range lines {
			if _, ok := bySKU[item.SKU]; !ok {
				t.Fatalf("event uses unknown SKU %q", item.SKU)
			}
		}
	}

	for sku, remaining := range stock {
		if remaining < 0 {
			t.Errorf("%s: negative final stock %d", sku, remaining)
		}
	}
}

func TestDemoUsersAreValid(t *testing.T) {
	roles := map[string]bool{
		"owner": true, "admin": true, "mekanik": true, "staff": true,
	}
	emails := make(map[string]bool, len(demoUsers))

	for _, user := range demoUsers {
		if !roles[user.Role] {
			t.Errorf("invalid role %q for %s", user.Role, user.Email)
		}
		if len(user.Password) < 8 {
			t.Errorf("password too short for %s", user.Email)
		}
		if emails[user.Email] {
			t.Errorf("duplicate demo email %s", user.Email)
		}
		emails[user.Email] = true
	}

	if !emails["owner@bengkelku.id"] {
		t.Error("owner demo account is missing")
	}
}
