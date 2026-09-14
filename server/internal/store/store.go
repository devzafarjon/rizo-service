package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lucsky/cuid"
	"servise-module/server/internal/domain"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
}

func Connect(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) NewID() string { return cuid.New() }

type User struct {
	ID    string
	Name  string
	Email string
	Role  string
	Phone *string
	Hash  string
}

func publicUser(u User) map[string]any {
	return map[string]any{"id": u.ID, "name": u.Name, "email": u.Email, "role": u.Role, "phone": u.Phone}
}

func (s *Store) FindUserByEmail(ctx context.Context, email string) (*User, error) {
	return s.scanUser(ctx, `select id, name, email, password_hash, role::text, phone from users where email = $1`, email)
}

func (s *Store) FindUserByID(ctx context.Context, id string) (*User, error) {
	return s.scanUser(ctx, `select id, name, email, password_hash, role::text, phone from users where id = $1`, id)
}

func (s *Store) scanUser(ctx context.Context, q string, args ...any) (*User, error) {
	var u User
	err := s.pool.QueryRow(ctx, q, args...).Scan(&u.ID, &u.Name, &u.Email, &u.Hash, &u.Role, &u.Phone)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) PublicUser(u User) map[string]any { return publicUser(u) }

func (s *Store) ListTechnicians(ctx context.Context) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `select id, name, email, role::text, phone from users where role = 'technician' order by name asc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Phone); err != nil {
			return nil, err
		}
		out = append(out, publicUser(u))
	}
	return out, rows.Err()
}

func (s *Store) ListCustomers(ctx context.Context, q string) ([]map[string]any, error) {
	sql := `select c.id, c.name, c.phone, c.email, c.notes, c.maintenance_interval_months, c.next_maintenance_on, c.created_at,
		(select count(*) from jobs j where j.customer_id = c.id)
		from customers c`
	args := []any{}
	if q != "" {
		sql += ` where c.name ilike $1 or coalesce(c.phone,'') ilike $1 or coalesce(c.email,'') ilike $1`
		args = append(args, "%"+like(q)+"%")
	}
	sql += ` order by c.created_at desc`
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	ids := []string{}
	for rows.Next() {
		var id, name string
		var phone, email, notes *string
		var interval int
		var next *time.Time
		var created time.Time
		var jobs int
		if err := rows.Scan(&id, &name, &phone, &email, &notes, &interval, &next, &created, &jobs); err != nil {
			return nil, err
		}
		ids = append(ids, id)
		out = append(out, map[string]any{
			"id": id, "name": name, "phone": phone, "email": email, "notes": notes,
			"maintenanceIntervalMonths": interval,
			"nextMaintenanceOn":         domain.PtrTime(next, true),
			"createdAt":                 domain.IsoDateTime(created),
			"locations":                 []any{},
			"_count":                    map[string]any{"jobs": jobs},
		})
	}
	locs, err := s.locationsByCustomers(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i, item := range out {
		item["locations"] = locs[item["id"].(string)]
		if item["locations"] == nil {
			item["locations"] = []any{}
		}
		out[i] = item
	}
	return out, rows.Err()
}

func (s *Store) GetCustomer(ctx context.Context, id string) (map[string]any, error) {
	var name string
	var phone, email, notes *string
	var interval int
	var next *time.Time
	var created time.Time
	err := s.pool.QueryRow(ctx, `select name, phone, email, notes, maintenance_interval_months, next_maintenance_on, created_at from customers where id = $1`, id).
		Scan(&name, &phone, &email, &notes, &interval, &next, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	locs, err := s.locationsByCustomers(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	jobs, err := s.customerJobs(ctx, id)
	if err != nil {
		return nil, err
	}
	locations := locs[id]
	if locations == nil {
		locations = []any{}
	}
	return map[string]any{
		"id": id, "name": name, "phone": phone, "email": email, "notes": notes,
		"maintenanceIntervalMonths": interval,
		"nextMaintenanceOn":         domain.PtrTime(next, true),
		"createdAt":                 domain.IsoDateTime(created),
		"locations":                 locations,
		"jobs":                      jobs,
	}, nil
}

func (s *Store) CreateCustomer(ctx context.Context, id string, name string, phone, email, notes *string, interval int, next *time.Time) (map[string]any, error) {
	var created time.Time
	err := s.pool.QueryRow(ctx, `insert into customers (id, name, phone, email, notes, maintenance_interval_months, next_maintenance_on)
		values ($1,$2,$3,$4,$5,$6,$7) returning created_at`, id, name, phone, email, notes, interval, next).Scan(&created)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "name": name, "phone": phone, "email": email, "notes": notes,
		"maintenanceIntervalMonths": interval,
		"nextMaintenanceOn":         domain.PtrTime(next, true),
		"createdAt":                 domain.IsoDateTime(created),
		"locations":                 []any{},
		"_count":                    map[string]any{"jobs": 0},
	}, nil
}

func (s *Store) UpdateCustomer(ctx context.Context, id string, fields map[string]any) (map[string]any, error) {
	sets := []string{}
	args := []any{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if v, ok := fields["name"]; ok {
		add("name", v)
	}
	if v, ok := fields["phone"]; ok {
		add("phone", v)
	}
	if v, ok := fields["email"]; ok {
		add("email", v)
	}
	if v, ok := fields["notes"]; ok {
		add("notes", v)
	}
	if v, ok := fields["maintenanceIntervalMonths"]; ok {
		add("maintenance_interval_months", v)
	}
	if v, ok := fields["nextMaintenanceOn"]; ok {
		add("next_maintenance_on", v)
	}
	if len(sets) == 0 {
		return s.customerSummary(ctx, id)
	}
	args = append(args, id)
	_, err := s.pool.Exec(ctx, `update customers set `+strings.Join(sets, ", ")+fmt.Sprintf(` where id = $%d`, len(args)), args...)
	if err != nil {
		return nil, err
	}
	return s.customerSummary(ctx, id)
}

func (s *Store) customerSummary(ctx context.Context, id string) (map[string]any, error) {
	var name string
	var phone, email, notes *string
	var interval, jobs int
	var next *time.Time
	var created time.Time
	err := s.pool.QueryRow(ctx, `select name, phone, email, notes, maintenance_interval_months, next_maintenance_on, created_at,
		(select count(*) from jobs j where j.customer_id = customers.id)
		from customers where id = $1`, id).Scan(&name, &phone, &email, &notes, &interval, &next, &created, &jobs)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	locs, err := s.locationsByCustomers(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	locations := locs[id]
	if locations == nil {
		locations = []any{}
	}
	return map[string]any{
		"id": id, "name": name, "phone": phone, "email": email, "notes": notes,
		"maintenanceIntervalMonths": interval,
		"nextMaintenanceOn":         domain.PtrTime(next, true),
		"createdAt":                 domain.IsoDateTime(created),
		"locations":                 locations,
		"_count":                    map[string]any{"jobs": jobs},
	}, nil
}

func (s *Store) CountJobsForCustomer(ctx context.Context, id string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*) from jobs where customer_id = $1`, id).Scan(&n)
	return n, err
}

func (s *Store) DeleteCustomer(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `delete from customers where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CreateLocation(ctx context.Context, id, customerID, address, city string, lat, lng *float64, notes *string) (map[string]any, error) {
	_, err := s.pool.Exec(ctx, `insert into service_locations (id, customer_id, address, city, lat, lng, notes) values ($1,$2,$3,$4,$5,$6,$7)`,
		id, customerID, address, city, lat, lng, notes)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "customerId": customerID, "address": address, "city": city, "lat": lat, "lng": lng, "notes": notes,
	}, nil
}

func (s *Store) LocationBelongs(ctx context.Context, locationID, customerID string) (bool, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*) from service_locations where id = $1 and customer_id = $2`, locationID, customerID).Scan(&n)
	return n > 0, err
}

func (s *Store) locationsByCustomers(ctx context.Context, ids []string) (map[string][]any, error) {
	out := map[string][]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `select id, customer_id, address, city, lat, lng, notes from service_locations where customer_id = any($1) order by address asc`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, customerID, address, city string
		var lat, lng *float64
		var notes *string
		if err := rows.Scan(&id, &customerID, &address, &city, &lat, &lng, &notes); err != nil {
			return nil, err
		}
		out[customerID] = append(out[customerID], map[string]any{
			"id": id, "customerId": customerID, "address": address, "city": city, "lat": lat, "lng": lng, "notes": notes,
		})
	}
	return out, rows.Err()
}

func (s *Store) customerJobs(ctx context.Context, customerID string) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `
		select j.id, j.title, j.status::text, j.kind::text, j.created_at,
			l.id, l.customer_id, l.address, l.city, l.lat, l.lng, l.notes,
			u.id, u.name
		from jobs j
		join service_locations l on l.id = j.location_id
		left join users u on u.id = j.assigned_technician_id
		where j.customer_id = $1
		order by j.created_at desc`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, title, status, kind string
		var created time.Time
		var locID, locCustomer, address, city string
		var lat, lng *float64
		var notes *string
		var techID, techName *string
		if err := rows.Scan(&id, &title, &status, &kind, &created, &locID, &locCustomer, &address, &city, &lat, &lng, &notes, &techID, &techName); err != nil {
			return nil, err
		}
		var tech any
		if techID != nil {
			tech = map[string]any{"id": *techID, "name": *techName}
		}
		out = append(out, map[string]any{
			"id": id, "title": title, "status": status, "kind": kind, "createdAt": domain.IsoDateTime(created),
			"location":            map[string]any{"id": locID, "customerId": locCustomer, "address": address, "city": city, "lat": lat, "lng": lng, "notes": notes},
			"assignedTechnician": tech,
		})
	}
	return out, rows.Err()
}

type JobFilter struct {
	Mine          bool
	UserID        string
	TechnicianOnly bool
	Status        string
	Priority      string
	TechnicianID  string
	Kind          string
	From          string
	To            string
	Q             string
}

func (s *Store) ListJobs(ctx context.Context, f JobFilter) ([]map[string]any, error) {
	where := []string{"1=1"}
	args := []any{}
	add := func(clause string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if f.Mine || f.TechnicianOnly {
		add("j.assigned_technician_id = $%d", f.UserID)
	}
	if f.Status != "" {
		add("j.status = $%d", f.Status)
	}
	if f.Priority != "" {
		add("j.priority = $%d", f.Priority)
	}
	if f.TechnicianID != "" {
		add("j.assigned_technician_id = $%d", f.TechnicianID)
	}
	if f.Kind != "" {
		add("j.kind = $%d", f.Kind)
	}
	if f.From != "" {
		add("j.scheduled_date >= $%d", domain.StartOfDay(f.From))
	}
	if f.To != "" {
		add("j.scheduled_date <= $%d", domain.StartOfDay(f.To))
	}
	if f.Q != "" {
		args = append(args, "%"+like(f.Q)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(`(j.title ilike $%d or c.name ilike $%d or l.address ilike $%d or coalesce(j.order_ref,'') ilike $%d)`, n, n, n, n))
	}
	rows, err := s.pool.Query(ctx, `select j.id from jobs j join customers c on c.id = j.customer_id join service_locations l on l.id = j.location_id where `+strings.Join(where, " and ")+` order by j.scheduled_date asc nulls last, j.created_at desc`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return s.loadJobs(ctx, ids)
}

func (s *Store) GetJob(ctx context.Context, id string) (map[string]any, error) {
	jobs, err := s.loadJobs(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	if len(jobs) == 0 {
		return nil, nil
	}
	return jobs[0], nil
}

func (s *Store) JobMeta(ctx context.Context, id string) (assigned *string, status, kind string, startedAt *time.Time, labor *float64, start, end *string, customerID string, ok bool, err error) {
	var assignedID *string
	err = s.pool.QueryRow(ctx, `select assigned_technician_id, status::text, kind::text, started_at, labor_hours, scheduled_time_start, scheduled_time_end, customer_id from jobs where id = $1`, id).
		Scan(&assignedID, &status, &kind, &startedAt, &labor, &start, &end, &customerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", "", nil, nil, nil, nil, "", false, nil
	}
	if err != nil {
		return nil, "", "", nil, nil, nil, nil, "", false, err
	}
	return assignedID, status, kind, startedAt, labor, start, end, customerID, true, nil
}

func (s *Store) CreateJob(ctx context.Context, row map[string]any) (map[string]any, error) {
	_, err := s.pool.Exec(ctx, `insert into jobs (
		id, title, description, kind, order_ref, checklist, status, priority, customer_id, location_id,
		assigned_technician_id, scheduled_date, scheduled_time_start, scheduled_time_end, submitted_by_customer, related_sale_id
	) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		row["id"], row["title"], row["description"], row["kind"], row["orderRef"], row["checklist"],
		row["status"], row["priority"], row["customerId"], row["locationId"], row["assignedTechnicianId"],
		row["scheduledDate"], row["scheduledTimeStart"], row["scheduledTimeEnd"], row["submittedByCustomer"], row["relatedSaleId"],
	)
	if err != nil {
		return nil, err
	}
	return s.GetJob(ctx, row["id"].(string))
}

func (s *Store) UpdateJobFields(ctx context.Context, id string, fields map[string]any) (map[string]any, error) {
	sets := []string{}
	args := []any{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	for col, v := range fields {
		add(col, v)
	}
	if len(sets) == 0 {
		return s.GetJob(ctx, id)
	}
	args = append(args, id)
	_, err := s.pool.Exec(ctx, `update jobs set `+strings.Join(sets, ", ")+fmt.Sprintf(` where id = $%d`, len(args)), args...)
	if err != nil {
		return nil, err
	}
	return s.GetJob(ctx, id)
}

func (s *Store) ApplyStatus(ctx context.Context, id, next, actor string) (map[string]any, int, string, error) {
	assigned, status, kind, startedAt, labor, start, end, customerID, ok, err := s.JobMeta(ctx, id)
	if err != nil {
		return nil, 500, "", err
	}
	if !ok {
		return nil, 404, "Job not found", nil
	}
	_ = assigned
	if actor == "technician" {
		allowed := (next == "in_progress" && (status == "new" || status == "scheduled")) ||
			(next == "completed" && status == "in_progress")
		if !allowed {
			return nil, 403, "Forbidden status change", nil
		}
	} else if !domain.CanTransition(status, next) && status != next {
		return nil, 400, "Invalid status change", nil
	}
	now := time.Now().UTC()
	fields := map[string]any{"status": next}
	if next == "in_progress" && startedAt == nil {
		fields["started_at"] = now
	}
	if next == "completed" {
		fields["completed_at"] = now
		if labor == nil {
			var st, en string
			if start != nil {
				st = *start
			}
			if end != nil {
				en = *end
			}
			fields["labor_hours"] = domain.LaborHoursFor(startedAt, st, en, now)
		}
		if kind == "maintenance" {
			if err := s.scheduleNextMaintenance(ctx, customerID); err != nil {
				return nil, 500, "", err
			}
		}
	}
	if next == "cancelled" {
		fields["completed_at"] = now
	}
	if next == "new" {
		fields["assigned_technician_id"] = nil
	}
	job, err := s.UpdateJobFields(ctx, id, fields)
	if err != nil {
		return nil, 500, "", err
	}
	return job, 200, "", nil
}

func (s *Store) scheduleNextMaintenance(ctx context.Context, customerID string) error {
	var months int
	err := s.pool.QueryRow(ctx, `select maintenance_interval_months from customers where id = $1`, customerID).Scan(&months)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if months <= 0 {
		months = 3
	}
	next := domain.AddMonths(domain.StartOfDay(domain.CalendarDate()), months)
	_, err = s.pool.Exec(ctx, `update customers set next_maintenance_on = $1 where id = $2`, next, customerID)
	return err
}

func (s *Store) AddNote(ctx context.Context, id, jobID, userID, text string, visible bool) error {
	_, err := s.pool.Exec(ctx, `insert into job_notes (id, job_id, user_id, note_text, visible_to_customer) values ($1,$2,$3,$4,$5)`,
		id, jobID, userID, text, visible)
	return err
}

func (s *Store) AddPhoto(ctx context.Context, id, jobID, url, userID string) error {
	_, err := s.pool.Exec(ctx, `insert into job_photos (id, job_id, photo_url, uploaded_by) values ($1,$2,$3,$4)`, id, jobID, url, userID)
	return err
}

func (s *Store) AddPart(ctx context.Context, id, jobID, name string, qty int, cost float64) error {
	_, err := s.pool.Exec(ctx, `insert into parts_used (id, job_id, part_name, quantity, unit_cost) values ($1,$2,$3,$4,$5)`, id, jobID, name, qty, cost)
	return err
}

func (s *Store) Dispatch(ctx context.Context, date string) ([]map[string]any, []map[string]any, error) {
	day := domain.StartOfDay(date)
	techs, err := s.ListTechnicians(ctx)
	if err != nil {
		return nil, nil, err
	}
	rows, err := s.pool.Query(ctx, `select id from jobs where status in ('new','scheduled','in_progress') and (scheduled_date = $1 or (scheduled_date is null and status = 'new')) order by scheduled_time_start asc nulls last, created_at asc`, day)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
	}
	jobs, err := s.loadJobs(ctx, ids)
	return techs, jobs, err
}

func (s *Store) AutoPlan(ctx context.Context, date string) ([]map[string]any, error) {
	techs, err := s.ListTechnicians(ctx)
	if err != nil {
		return nil, err
	}
	if len(techs) == 0 {
		return nil, errors.New("no technicians")
	}
	day := domain.StartOfDay(date)
	load := map[string]int{}
	for _, t := range techs {
		load[t["id"].(string)] = 0
	}
	rows, err := s.pool.Query(ctx, `select assigned_technician_id, count(*) from jobs where scheduled_date = $1 and assigned_technician_id is not null and status <> 'cancelled' group by assigned_technician_id`, day)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			rows.Close()
			return nil, err
		}
		load[id] = n
	}
	rows.Close()
	open, err := s.pool.Query(ctx, `select id from jobs where assigned_technician_id is null and status in ('new','scheduled') and (scheduled_date = $1 or scheduled_date is null) order by priority desc, created_at asc`, day)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for open.Next() {
		var id string
		if err := open.Scan(&id); err != nil {
			open.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	open.Close()
	updated := []map[string]any{}
	for _, jobID := range ids {
		best := techs[0]["id"].(string)
		bestLoad := load[best]
		for _, t := range techs {
			id := t["id"].(string)
			if load[id] < bestLoad {
				best = id
				bestLoad = load[id]
			}
		}
		job, err := s.UpdateJobFields(ctx, jobID, map[string]any{
			"assigned_technician_id": best,
			"scheduled_date":         day,
			"status":                 "scheduled",
		})
		if err != nil {
			return nil, err
		}
		load[best]++
		updated = append(updated, job)
	}
	return updated, nil
}

func (s *Store) Dashboard(ctx context.Context) (map[string]any, error) {
	today := domain.StartOfDay(domain.CalendarDate())
	count := func(q string, args ...any) (int, error) {
		var n int
		err := s.pool.QueryRow(ctx, q, args...).Scan(&n)
		return n, err
	}
	openJobs, err := count(`select count(*) from jobs where status in ('new','scheduled','in_progress')`)
	if err != nil {
		return nil, err
	}
	overdue, err := count(`select count(*) from jobs where status in ('new','scheduled') and scheduled_date < $1`, today)
	if err != nil {
		return nil, err
	}
	unassigned, err := count(`select count(*) from jobs where assigned_technician_id is null and status in ('new','scheduled')`)
	if err != nil {
		return nil, err
	}
	urgent, err := count(`select count(*) from jobs where priority = 'urgent' and status in ('new','scheduled','in_progress')`)
	if err != nil {
		return nil, err
	}
	invoicesDue, err := count(`select count(*) from invoices where status in ('draft','sent')`)
	if err != nil {
		return nil, err
	}
	todayJobs, err := count(`select count(*) from jobs where scheduled_date = $1 and status <> 'cancelled'`, today)
	if err != nil {
		return nil, err
	}
	completedToday, err := count(`select count(*) from jobs where status in ('completed','invoiced') and completed_at >= $1`, today)
	if err != nil {
		return nil, err
	}
	installationsOpen, err := count(`select count(*) from jobs where kind = 'installation' and status in ('new','scheduled','in_progress')`)
	if err != nil {
		return nil, err
	}
	maintenanceOpen, err := count(`select count(*) from jobs where kind = 'maintenance' and status in ('new','scheduled','in_progress')`)
	if err != nil {
		return nil, err
	}
	maintenanceDue, err := count(`select count(*) from customers where next_maintenance_on <= $1`, today)
	if err != nil {
		return nil, err
	}
	var dueAmount float64
	_ = s.pool.QueryRow(ctx, `select coalesce(sum(amount),0) from invoices where status in ('draft','sent')`).Scan(&dueAmount)
	rows, err := s.pool.Query(ctx, `select id, name, phone, next_maintenance_on, maintenance_interval_months from customers where next_maintenance_on <= $1 order by next_maintenance_on asc limit 8`, today)
	if err != nil {
		return nil, err
	}
	shops := []map[string]any{}
	for rows.Next() {
		var id, name string
		var phone *string
		var next *time.Time
		var months int
		if err := rows.Scan(&id, &name, &phone, &next, &months); err != nil {
			rows.Close()
			return nil, err
		}
		shops = append(shops, map[string]any{
			"id": id, "name": name, "phone": phone,
			"nextMaintenanceOn":         domain.PtrTime(next, true),
			"maintenanceIntervalMonths": months,
		})
	}
	rows.Close()
	recentRows, err := s.pool.Query(ctx, `select id from jobs where status <> 'cancelled' order by created_at desc limit 6`)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for recentRows.Next() {
		var id string
		if err := recentRows.Scan(&id); err != nil {
			recentRows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	recentRows.Close()
	recent, err := s.loadJobs(ctx, ids)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"stats": map[string]any{
			"openJobs": openJobs, "invoicesDue": invoicesDue, "overdue": overdue, "unassigned": unassigned,
			"urgent": urgent, "todayJobs": todayJobs, "completedToday": completedToday, "dueAmount": dueAmount,
			"installationsOpen": installationsOpen, "maintenanceOpen": maintenanceOpen, "maintenanceDue": maintenanceDue,
		},
		"maintenanceDueShops": shops,
		"recentJobs":          recent,
	}, nil
}

func (s *Store) ListInvoices(ctx context.Context, status string) ([]map[string]any, error) {
	q := `select id from invoices`
	args := []any{}
	if domain.ValidInvoiceStatus(status) {
		q += ` where status = $1`
		args = append(args, status)
	}
	q += ` order by created_at desc`
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	out := []map[string]any{}
	for _, id := range ids {
		inv, err := s.GetInvoice(ctx, id, false)
		if err != nil {
			return nil, err
		}
		if inv != nil {
			out = append(out, inv)
		}
	}
	return out, nil
}

func (s *Store) GetInvoice(ctx context.Context, id string, withPhone bool) (map[string]any, error) {
	var jobID string
	var amount float64
	var status string
	var created time.Time
	err := s.pool.QueryRow(ctx, `select job_id, amount, status::text, created_at from invoices where id = $1`, id).
		Scan(&jobID, &amount, &status, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	job, err := s.invoiceJob(ctx, jobID, withPhone)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "jobId": jobID, "amount": amount, "status": status, "createdAt": domain.IsoDateTime(created), "job": job,
	}, nil
}

func (s *Store) invoiceJob(ctx context.Context, id string, withPhone bool) (map[string]any, error) {
	job, err := s.GetJob(ctx, id)
	if err != nil || job == nil {
		return job, err
	}
	tech, _ := job["assignedTechnician"].(map[string]any)
	if tech != nil && !withPhone {
		job["assignedTechnician"] = map[string]any{"id": tech["id"], "name": tech["name"]}
	}
	return job, nil
}

func (s *Store) CreateInvoice(ctx context.Context, id, jobID string, amount float64) (map[string]any, error) {
	var created time.Time
	err := s.pool.QueryRow(ctx, `insert into invoices (id, job_id, amount, status) values ($1,$2,$3,'draft') returning created_at`, id, jobID, amount).Scan(&created)
	if err != nil {
		return nil, err
	}
	if _, err := s.pool.Exec(ctx, `update jobs set status = 'invoiced' where id = $1`, jobID); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "jobId": jobID, "amount": amount, "status": "draft", "createdAt": domain.IsoDateTime(created)}, nil
}

func (s *Store) JobInvoiceCount(ctx context.Context, jobID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*) from invoices where job_id = $1`, jobID).Scan(&n)
	return n, err
}

func (s *Store) JobParts(ctx context.Context, jobID string) ([]domain.Part, *float64, error) {
	rows, err := s.pool.Query(ctx, `select quantity, unit_cost from parts_used where job_id = $1`, jobID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	parts := []domain.Part{}
	for rows.Next() {
		var p domain.Part
		if err := rows.Scan(&p.Quantity, &p.UnitCost); err != nil {
			return nil, nil, err
		}
		parts = append(parts, p)
	}
	var labor *float64
	if err := s.pool.QueryRow(ctx, `select labor_hours from jobs where id = $1`, jobID).Scan(&labor); err != nil {
		return nil, nil, err
	}
	return parts, labor, nil
}

func (s *Store) UpdateInvoiceStatus(ctx context.Context, id, status string) (map[string]any, error) {
	tag, err := s.pool.Exec(ctx, `update invoices set status = $1 where id = $2`, status, id)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.GetInvoice(ctx, id, false)
}

func (s *Store) Feedback(ctx context.Context) (map[string]any, error) {
	rows, err := s.pool.Query(ctx, `
		select f.id, f.rating, f.comment, f.created_at, c.name, j.id, j.title, j.kind::text, u.id, u.name
		from feedback f
		join customers c on c.id = f.customer_id
		join jobs j on j.id = f.job_id
		left join users u on u.id = j.assigned_technician_id
		order by f.created_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	sum := 0
	byTech := map[string]*struct {
		id, name string
		ratings  []int
	}{}
	for rows.Next() {
		var id string
		var rating int
		var comment *string
		var created time.Time
		var customerName, jobID, jobTitle, kind string
		var techID, techName *string
		if err := rows.Scan(&id, &rating, &comment, &created, &customerName, &jobID, &jobTitle, &kind, &techID, &techName); err != nil {
			return nil, err
		}
		sum += rating
		var technicianName any
		if techName != nil {
			technicianName = *techName
			row := byTech[*techID]
			if row == nil {
				row = &struct {
					id, name string
					ratings  []int
				}{id: *techID, name: *techName}
				byTech[*techID] = row
			}
			row.ratings = append(row.ratings, rating)
		}
		items = append(items, map[string]any{
			"id": id, "rating": rating, "comment": comment, "createdAt": domain.IsoDateTime(created),
			"customerName": customerName, "jobId": jobID, "jobTitle": jobTitle, "kind": kind, "technicianName": technicianName,
		})
	}
	overall := 0.0
	if len(items) > 0 {
		overall = domain.Round1(float64(sum) / float64(len(items)))
	}
	techs := []map[string]any{}
	for _, t := range byTech {
		s := 0
		for _, r := range t.ratings {
			s += r
		}
		techs = append(techs, map[string]any{
			"id": t.id, "name": t.name, "count": len(t.ratings), "average": domain.Round1(float64(s) / float64(len(t.ratings))),
		})
	}
	return map[string]any{
		"overall":     map[string]any{"average": overall, "count": len(items)},
		"technicians": techs,
		"feedback":    items,
	}, nil
}

func (s *Store) FindCustomerAuth(ctx context.Context, email string) (id, name string, phone *string, hash *string, verified bool, mail *string, ok bool, err error) {
	err = s.pool.QueryRow(ctx, `select id, name, phone, email, password_hash, email_verified from customers where email = $1`, email).
		Scan(&id, &name, &phone, &mail, &hash, &verified)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil, nil, false, nil, false, nil
	}
	if err != nil {
		return "", "", nil, nil, false, nil, false, err
	}
	return id, name, phone, hash, verified, mail, true, nil
}

func (s *Store) FindCustomerByPhone(ctx context.Context, digits string) (map[string]any, error) {
	if len(digits) < 7 {
		return nil, nil
	}
	want := digits
	if len(want) > 9 {
		want = want[len(want)-9:]
	}
	rows, err := s.pool.Query(ctx, `select id, name, phone, email, password_hash, email_verified from customers where phone is not null`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		var phone, email, hash *string
		var verified bool
		if err := rows.Scan(&id, &name, &phone, &email, &hash, &verified); err != nil {
			return nil, err
		}
		got := domain.Digits(deref(phone))
		if strings.HasSuffix(got, want) {
			return map[string]any{"id": id, "name": name, "phone": phone, "email": email, "passwordHash": hash, "emailVerified": verified}, nil
		}
	}
	return nil, rows.Err()
}

func (s *Store) CustomerByID(ctx context.Context, id string) (name string, phone, email *string, verified bool, ok bool, err error) {
	err = s.pool.QueryRow(ctx, `select name, phone, email, email_verified from customers where id = $1`, id).Scan(&name, &phone, &email, &verified)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, nil, false, false, nil
	}
	return name, phone, email, verified, err == nil, err
}

func (s *Store) CustomerLocations(ctx context.Context, id string) ([]map[string]any, error) {
	locs, err := s.locationsByCustomers(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	raw := locs[id]
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		m := item.(map[string]any)
		out = append(out, map[string]any{"id": m["id"], "address": m["address"], "city": m["city"]})
	}
	return out, nil
}

func (s *Store) CustomerSalesIDs(ctx context.Context, id string) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, `select id from sales where customer_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var sid string
		if err := rows.Scan(&sid); err != nil {
			return nil, err
		}
		out[sid] = true
	}
	return out, rows.Err()
}

func (s *Store) ClaimCustomer(ctx context.Context, id, email string, phone *string, hash string, verified bool) error {
	_, err := s.pool.Exec(ctx, `update customers set password_hash = $1, email = coalesce(email, $2), phone = coalesce(phone, $3), email_verified = $4 where id = $5`,
		hash, email, phone, verified, id)
	return err
}

func (s *Store) CreatePortalCustomer(ctx context.Context, id, name, email string, phone *string, hash, address, city string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `insert into customers (id, name, email, phone, password_hash, email_verified) values ($1,$2,$3,$4,$5,false)`, id, name, email, phone, hash); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `insert into service_locations (id, customer_id, address, city) values ($1,$2,$3,$4)`, s.NewID(), id, address, city); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) IssueToken(ctx context.Context, id, customerID, hash, purpose string, expires time.Time) error {
	_, err := s.pool.Exec(ctx, `insert into customer_auth_tokens (id, customer_id, token_hash, purpose, expires_at) values ($1,$2,$3,$4,$5)`,
		id, customerID, hash, purpose, expires)
	return err
}

func (s *Store) ConsumeToken(ctx context.Context, hash, purpose string) (customerID string, ok bool, err error) {
	var id, cid string
	var used *time.Time
	var exp time.Time
	var gotPurpose string
	err = s.pool.QueryRow(ctx, `select id, customer_id, purpose, expires_at, used_at from customer_auth_tokens where token_hash = $1`, hash).
		Scan(&id, &cid, &gotPurpose, &exp, &used)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if gotPurpose != purpose || used != nil || exp.Before(time.Now()) {
		return "", false, nil
	}
	if _, err := s.pool.Exec(ctx, `update customer_auth_tokens set used_at = now() where id = $1`, id); err != nil {
		return "", false, err
	}
	return cid, true, nil
}

func (s *Store) SetCustomerPassword(ctx context.Context, id, hash string) error {
	_, err := s.pool.Exec(ctx, `update customers set password_hash = $1 where id = $2`, hash, id)
	return err
}

func (s *Store) VerifyCustomerEmail(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `update customers set email_verified = true where id = $1`, id)
	return err
}

func (s *Store) PortalJobs(ctx context.Context, customerID, group, kind string) ([]map[string]any, error) {
	where := []string{"j.customer_id = $1"}
	args := []any{customerID}
	if group == "active" {
		where = append(where, `j.status in ('new','scheduled','in_progress')`)
	}
	if group == "completed" {
		where = append(where, `j.status in ('completed','invoiced','cancelled')`)
	}
	if kind != "" {
		args = append(args, kind)
		where = append(where, fmt.Sprintf("j.kind = $%d", len(args)))
	}
	rows, err := s.pool.Query(ctx, `select j.id from jobs j where `+strings.Join(where, " and ")+` order by j.created_at desc`, args...)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	return s.loadPortalJobs(ctx, ids)
}

func (s *Store) GetPortalJob(ctx context.Context, id, customerID string) (map[string]any, error) {
	var n int
	if err := s.pool.QueryRow(ctx, `select count(*) from jobs where id = $1 and customer_id = $2`, id, customerID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, nil
	}
	jobs, err := s.loadPortalJobs(ctx, []string{id})
	if err != nil || len(jobs) == 0 {
		return nil, err
	}
	return jobs[0], nil
}

func (s *Store) PortalJobMeta(ctx context.Context, id, customerID string) (status string, hasFeedback bool, ok bool, err error) {
	var n int
	err = s.pool.QueryRow(ctx, `select count(*) from jobs where id = $1 and customer_id = $2`, id, customerID).Scan(&n)
	if err != nil || n == 0 {
		return "", false, false, err
	}
	err = s.pool.QueryRow(ctx, `select status::text, exists(select 1 from feedback f where f.job_id = jobs.id) from jobs where id = $1`, id).Scan(&status, &hasFeedback)
	return status, hasFeedback, true, err
}

func (s *Store) CreateFeedback(ctx context.Context, id, jobID, customerID string, rating int, comment *string) (map[string]any, error) {
	var created time.Time
	err := s.pool.QueryRow(ctx, `insert into feedback (id, job_id, customer_id, rating, comment) values ($1,$2,$3,$4,$5) returning created_at`,
		id, jobID, customerID, rating, comment).Scan(&created)
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "jobId": jobID, "customerId": customerID, "rating": rating, "comment": comment, "createdAt": domain.IsoDateTime(created)}, nil
}

func (s *Store) ListSales(ctx context.Context, customerID string) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `select id, product_name, sold_on, notes from sales where customer_id = $1 order by sold_on desc`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name string
		var sold time.Time
		var notes *string
		if err := rows.Scan(&id, &name, &sold, &notes); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "productName": name, "soldOn": domain.IsoDate(sold), "notes": notes})
	}
	return out, rows.Err()
}

func (s *Store) loadJobs(ctx context.Context, ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return []map[string]any{}, nil
	}
	rows, err := s.pool.Query(ctx, `select id, title, description, kind::text, order_ref, checklist, status::text, priority::text,
		customer_id, location_id, assigned_technician_id, scheduled_date, scheduled_time_start, scheduled_time_end,
		created_at, started_at, completed_at, labor_hours, submitted_by_customer, related_sale_id
		from jobs where id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]map[string]any{}
	customerIDs := map[string]bool{}
	locationIDs := map[string]bool{}
	techIDs := map[string]bool{}
	for rows.Next() {
		var id, title, kind, status, priority, customerID, locationID string
		var desc, orderRef, assigned, start, end, related *string
		var checklist []byte
		var scheduled, started, completed *time.Time
		var created time.Time
		var labor *float64
		var submitted bool
		if err := rows.Scan(&id, &title, &desc, &kind, &orderRef, &checklist, &status, &priority, &customerID, &locationID, &assigned,
			&scheduled, &start, &end, &created, &started, &completed, &labor, &submitted, &related); err != nil {
			return nil, err
		}
		customerIDs[customerID] = true
		locationIDs[locationID] = true
		if assigned != nil {
			techIDs[*assigned] = true
		}
		byID[id] = map[string]any{
			"id": id, "title": title, "description": desc, "kind": kind, "orderRef": orderRef,
			"checklist": domain.ParseChecklist(checklist, kind), "status": status, "priority": priority,
			"customerId": customerID, "locationId": locationID, "assignedTechnicianId": assigned,
			"scheduledDate": domain.PtrTime(scheduled, true), "scheduledTimeStart": start, "scheduledTimeEnd": end,
			"createdAt": domain.IsoDateTime(created), "startedAt": domain.PtrTime(started, false), "completedAt": domain.PtrTime(completed, false),
			"laborHours": labor, "submittedByCustomer": submitted, "relatedSaleId": related,
			"notes": []any{}, "photos": []any{}, "partsUsed": []any{}, "invoices": []any{},
			"assignedTechnician": nil,
		}
	}
	customers, err := s.customersByIDs(ctx, keys(customerIDs))
	if err != nil {
		return nil, err
	}
	locations, err := s.locationsByIDs(ctx, keys(locationIDs))
	if err != nil {
		return nil, err
	}
	techs, err := s.usersByIDs(ctx, keys(techIDs))
	if err != nil {
		return nil, err
	}
	if err := s.attachJobChildren(ctx, byID); err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		job, ok := byID[id]
		if !ok {
			continue
		}
		job["customer"] = customers[job["customerId"].(string)]
		job["location"] = locations[job["locationId"].(string)]
		if assigned, _ := job["assignedTechnicianId"].(*string); assigned != nil {
			job["assignedTechnician"] = techs[*assigned]
		}
		out = append(out, job)
	}
	return out, nil
}

func (s *Store) loadPortalJobs(ctx context.Context, ids []string) ([]map[string]any, error) {
	jobs, err := s.loadJobs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(jobs))
	for _, job := range jobs {
		out = append(out, s.serializePortal(ctx, job))
	}
	return out, nil
}

func (s *Store) serializePortal(ctx context.Context, job map[string]any) map[string]any {
	id := job["id"].(string)
	notes := []any{}
	if raw, ok := job["notes"].([]any); ok {
		for _, item := range raw {
			n := item.(map[string]any)
			if n["visibleToCustomer"] == true {
				notes = append(notes, map[string]any{"id": n["id"], "noteText": n["noteText"], "createdAt": n["createdAt"]})
			}
		}
	}
	publicInvoices := []map[string]any{}
	if raw, ok := job["invoices"].([]any); ok {
		for _, item := range raw {
			inv := item.(map[string]any)
			st := inv["status"].(string)
			if st == "sent" || st == "paid" {
				publicInvoices = append(publicInvoices, map[string]any{"id": inv["id"], "amount": inv["amount"], "status": st})
			}
		}
	}
	var labor *float64
	if v, ok := job["laborHours"].(*float64); ok {
		labor = v
	} else if v, ok := job["laborHours"].(float64); ok {
		labor = &v
	}
	parts := []domain.Part{}
	if raw, ok := job["partsUsed"].([]any); ok {
		for _, item := range raw {
			p := item.(map[string]any)
			qty, _ := p["quantity"].(int)
			if qty == 0 {
				if f, ok := p["quantity"].(float64); ok {
					qty = int(f)
				}
			}
			cost, _ := p["unitCost"].(float64)
			parts = append(parts, domain.Part{Quantity: qty, UnitCost: cost})
		}
	}
	status := job["status"].(string)
	var computed *float64
	if status == "completed" || status == "invoiced" {
		amt := domain.InvoiceAmount(parts, labor)
		computed = &amt
	}
	var payment any
	if len(publicInvoices) > 0 {
		payment = publicInvoices[0]
	} else if computed != nil {
		st := "draft"
		if status == "invoiced" {
			st = "paid"
		}
		payment = map[string]any{"id": nil, "amount": *computed, "status": st}
	}
	loc := job["location"].(map[string]any)
	var techName any
	if tech, ok := job["assignedTechnician"].(map[string]any); ok && tech != nil {
		if name, _ := tech["name"].(string); name != "" {
			techName = domain.FirstName(name)
		}
	}
	related := s.relatedSale(ctx, job)
	feedback := s.jobFeedback(ctx, id)
	return map[string]any{
		"id": id, "title": job["title"], "description": job["description"], "kind": job["kind"], "status": status,
		"orderRef": job["orderRef"], "submittedByCustomer": job["submittedByCustomer"],
		"scheduledDate": job["scheduledDate"], "scheduledTimeStart": job["scheduledTimeStart"], "scheduledTimeEnd": job["scheduledTimeEnd"],
		"createdAt": job["createdAt"], "completedAt": job["completedAt"],
		"location": map[string]any{"id": loc["id"], "address": loc["address"], "city": loc["city"]},
		"technicianName": techName, "relatedSale": related, "notes": notes, "payment": payment, "feedback": feedback,
	}
}

func (s *Store) relatedSale(ctx context.Context, job map[string]any) any {
	id, _ := job["relatedSaleId"].(*string)
	if id == nil {
		return nil
	}
	var sid, name string
	err := s.pool.QueryRow(ctx, `select id, product_name from sales where id = $1`, *id).Scan(&sid, &name)
	if err != nil {
		return nil
	}
	return map[string]any{"id": sid, "productName": name}
}

func (s *Store) jobFeedback(ctx context.Context, jobID string) any {
	var id string
	var rating int
	var comment *string
	var created time.Time
	err := s.pool.QueryRow(ctx, `select id, rating, comment, created_at from feedback where job_id = $1`, jobID).Scan(&id, &rating, &comment, &created)
	if err != nil {
		return nil
	}
	return map[string]any{"id": id, "rating": rating, "comment": comment, "createdAt": domain.IsoDateTime(created)}
}

func (s *Store) attachJobChildren(ctx context.Context, jobs map[string]map[string]any) error {
	ids := keysMap(jobs)
	if len(ids) == 0 {
		return nil
	}
	noteRows, err := s.pool.Query(ctx, `select n.id, n.job_id, n.user_id, n.note_text, n.visible_to_customer, n.created_at, u.id, u.name
		from job_notes n join users u on u.id = n.user_id where n.job_id = any($1) order by n.created_at desc`, ids)
	if err != nil {
		return err
	}
	for noteRows.Next() {
		var id, jobID, userID, text, uid, uname string
		var visible bool
		var created time.Time
		if err := noteRows.Scan(&id, &jobID, &userID, &text, &visible, &created, &uid, &uname); err != nil {
			noteRows.Close()
			return err
		}
		jobs[jobID]["notes"] = append(jobs[jobID]["notes"].([]any), map[string]any{
			"id": id, "jobId": jobID, "userId": userID, "noteText": text, "visibleToCustomer": visible,
			"createdAt": domain.IsoDateTime(created), "user": map[string]any{"id": uid, "name": uname},
		})
	}
	noteRows.Close()
	photoRows, err := s.pool.Query(ctx, `select id, job_id, photo_url, uploaded_by, created_at from job_photos where job_id = any($1) order by created_at desc`, ids)
	if err != nil {
		return err
	}
	for photoRows.Next() {
		var id, jobID, url, uploaded string
		var created time.Time
		if err := photoRows.Scan(&id, &jobID, &url, &uploaded, &created); err != nil {
			photoRows.Close()
			return err
		}
		jobs[jobID]["photos"] = append(jobs[jobID]["photos"].([]any), map[string]any{
			"id": id, "jobId": jobID, "photoUrl": url, "uploadedBy": uploaded, "createdAt": domain.IsoDateTime(created),
		})
	}
	photoRows.Close()
	partRows, err := s.pool.Query(ctx, `select id, job_id, part_name, quantity, unit_cost from parts_used where job_id = any($1)`, ids)
	if err != nil {
		return err
	}
	for partRows.Next() {
		var id, jobID, name string
		var qty int
		var cost float64
		if err := partRows.Scan(&id, &jobID, &name, &qty, &cost); err != nil {
			partRows.Close()
			return err
		}
		jobs[jobID]["partsUsed"] = append(jobs[jobID]["partsUsed"].([]any), map[string]any{
			"id": id, "jobId": jobID, "partName": name, "quantity": qty, "unitCost": cost,
		})
	}
	partRows.Close()
	invRows, err := s.pool.Query(ctx, `select id, job_id, amount, status::text, created_at from invoices where job_id = any($1) order by created_at desc`, ids)
	if err != nil {
		return err
	}
	for invRows.Next() {
		var id, jobID, status string
		var amount float64
		var created time.Time
		if err := invRows.Scan(&id, &jobID, &amount, &status, &created); err != nil {
			invRows.Close()
			return err
		}
		jobs[jobID]["invoices"] = append(jobs[jobID]["invoices"].([]any), map[string]any{
			"id": id, "jobId": jobID, "amount": amount, "status": status, "createdAt": domain.IsoDateTime(created),
		})
	}
	invRows.Close()
	return nil
}

func (s *Store) customersByIDs(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `select id, name, phone, email, notes, maintenance_interval_months, next_maintenance_on, created_at from customers where id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		var phone, email, notes *string
		var interval int
		var next *time.Time
		var created time.Time
		if err := rows.Scan(&id, &name, &phone, &email, &notes, &interval, &next, &created); err != nil {
			return nil, err
		}
		out[id] = map[string]any{
			"id": id, "name": name, "phone": phone, "email": email, "notes": notes,
			"maintenanceIntervalMonths": interval, "nextMaintenanceOn": domain.PtrTime(next, true), "createdAt": domain.IsoDateTime(created),
		}
	}
	return out, rows.Err()
}

func (s *Store) locationsByIDs(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `select id, customer_id, address, city, lat, lng, notes from service_locations where id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, customerID, address, city string
		var lat, lng *float64
		var notes *string
		if err := rows.Scan(&id, &customerID, &address, &city, &lat, &lng, &notes); err != nil {
			return nil, err
		}
		out[id] = map[string]any{"id": id, "customerId": customerID, "address": address, "city": city, "lat": lat, "lng": lng, "notes": notes}
	}
	return out, rows.Err()
}

func (s *Store) usersByIDs(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `select id, name, email, role::text, phone from users where id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Phone); err != nil {
			return nil, err
		}
		out[u.ID] = publicUser(u)
	}
	return out, rows.Err()
}

func like(q string) string {
	return strings.ReplaceAll(strings.ReplaceAll(q, `\`, `\\`), `%`, `\%`)
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func keysMap(m map[string]map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func deref(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func MustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
