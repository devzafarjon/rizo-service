package domain

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode"
)

const LaborRate = 150_000

var dateRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
var emailRE = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

var ChecklistIDs = map[string][]string{
	"installation": {"confirm_order", "install_pos", "connect_peripherals", "network_login", "train_staff", "handover"},
	"maintenance":  {"inspect_hardware", "update_software", "test_receipts", "backup_reports", "clean_hardware", "schedule_next"},
	"repair":       {"diagnose", "fix_or_replace", "test_after", "photo_result"},
}

var StatusFlow = map[string][]string{
	"new":         {"scheduled", "in_progress", "cancelled"},
	"scheduled":   {"new", "in_progress", "cancelled"},
	"in_progress": {"completed", "cancelled"},
	"completed":   {"invoiced"},
	"cancelled":   {},
	"invoiced":    {},
}

func ValidStatus(v string) bool {
	_, ok := StatusFlow[v]
	return ok
}

func ValidPriority(v string) bool {
	switch v {
	case "low", "medium", "high", "urgent":
		return true
	}
	return false
}

func ValidKind(v string) bool {
	switch v {
	case "installation", "maintenance", "repair":
		return true
	}
	return false
}

func ValidInvoiceStatus(v string) bool {
	return v == "draft" || v == "sent" || v == "paid"
}

func CanTransition(from, to string) bool {
	for _, item := range StatusFlow[from] {
		if item == to {
			return true
		}
	}
	return false
}

func Closed(status string) bool {
	return status == "cancelled" || status == "invoiced"
}

func DefaultChecklist(kind string) []map[string]any {
	ids := ChecklistIDs[kind]
	if ids == nil {
		ids = ChecklistIDs["repair"]
	}
	out := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, map[string]any{"id": id, "done": false})
	}
	return out
}

func ParseChecklist(raw []byte, kind string) []map[string]any {
	defaults := DefaultChecklist(kind)
	if len(raw) == 0 {
		return defaults
	}
	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil || len(items) == 0 {
		return defaults
	}
	done := map[string]bool{}
	for _, item := range items {
		id, _ := item["id"].(string)
		if id == "" {
			continue
		}
		done[id] = truthy(item["done"])
	}
	for _, item := range defaults {
		id := item["id"].(string)
		item["done"] = done[id]
	}
	return defaults
}

func ChecklistJSON(items []map[string]any) []byte {
	b, _ := json.Marshal(items)
	return b
}

func IsDate(v string) bool { return dateRE.MatchString(v) }

func IsEmail(v string) bool { return emailRE.MatchString(v) }

func StartOfDay(date string) time.Time {
	t, _ := time.Parse(time.RFC3339, date+"T00:00:00.000Z")
	return t
}

func CalendarDate() string {
	loc, err := time.LoadLocation("Asia/Tashkent")
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format("2006-01-02")
}

func AddMonths(date time.Time, months int) time.Time {
	return date.UTC().AddDate(0, months, 0)
}

func IsoDateTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func IsoDate(t time.Time) string {
	return t.UTC().Format("2006-01-02T00:00:00.000Z")
}

func PtrTime(t *time.Time, dateOnly bool) any {
	if t == nil {
		return nil
	}
	if dateOnly {
		return IsoDate(*t)
	}
	return IsoDateTime(*t)
}

func HoursBetween(start, end time.Time) float64 {
	ms := end.Sub(start).Seconds()
	if ms < 0 {
		ms = 0
	}
	return math.Round((ms/3600)*100) / 100
}

func LaborHoursFor(startedAt *time.Time, start, end string, now time.Time) float64 {
	if startedAt != nil {
		hours := HoursBetween(*startedAt, now)
		if hours > 0 && hours <= 8 {
			return hours
		}
	}
	if start != "" && end != "" {
		sh, sm := splitHM(start)
		eh, em := splitHM(end)
		minutes := eh*60 + em - (sh*60 + sm)
		if minutes < 30 {
			minutes = 30
		}
		return math.Round((float64(minutes)/60)*100) / 100
	}
	return 1
}

func InvoiceAmount(parts []Part, laborHours *float64) float64 {
	var total float64
	for _, part := range parts {
		total += float64(part.Quantity) * part.UnitCost
	}
	hours := 0.0
	if laborHours != nil {
		hours = *laborHours
	}
	return math.Round((total+hours*LaborRate)*100) / 100
}

func Digits(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func FirstName(name string) any {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	return strings.Fields(name)[0]
}

func Round1(v float64) float64 {
	return math.Round(v*10) / 10
}

type Part struct {
	Quantity int
	UnitCost float64
}

func truthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		return t == "true" || t == "1"
	}
	return false
}

func splitHM(v string) (int, int) {
	parts := strings.Split(v, ":")
	h, m := 0, 0
	if len(parts) > 0 {
		h = atoi(parts[0])
	}
	if len(parts) > 1 {
		m = atoi(parts[1])
	}
	return h, m
}

func atoi(v string) int {
	n := 0
	for _, r := range v {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}
