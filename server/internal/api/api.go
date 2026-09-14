package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"servise-module/server/internal/auth"
	"servise-module/server/internal/config"
	"servise-module/server/internal/domain"
	"servise-module/server/internal/httpx"
	"servise-module/server/internal/realtime"
	"servise-module/server/internal/store"
)

type Server struct {
	cfg  *config.Config
	db   *store.Store
	hub  *realtime.Hub
	mux  *http.ServeMux
}

func New(cfg *config.Config, db *store.Store, hub *realtime.Hub) *Server {
	s := &Server{cfg: cfg, db: db, hub: hub, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return httpx.CORS(s.cfg.AllowedOrigin, s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, 200, map[string]any{"ok": true, "service": "fsm-api"})
	})

	s.mux.HandleFunc("POST /api/auth/login", s.login)
	s.mux.HandleFunc("GET /api/auth/me", s.staff(s.me))

	s.mux.HandleFunc("GET /api/customers", s.staffRole("dispatcher", s.listCustomers))
	s.mux.HandleFunc("POST /api/customers", s.staffRole("dispatcher", s.createCustomer))
	s.mux.HandleFunc("GET /api/customers/{id}", s.staffRole("dispatcher", s.getCustomer))
	s.mux.HandleFunc("PATCH /api/customers/{id}", s.staffRole("dispatcher", s.patchCustomer))
	s.mux.HandleFunc("DELETE /api/customers/{id}", s.staffRole("dispatcher", s.deleteCustomer))
	s.mux.HandleFunc("POST /api/customers/{id}/locations", s.staffRole("dispatcher", s.addLocation))

	s.mux.HandleFunc("GET /api/jobs", s.staff(s.listJobs))
	s.mux.HandleFunc("POST /api/jobs", s.staffRole("dispatcher", s.createJob))
	s.mux.HandleFunc("GET /api/jobs/{id}", s.staff(s.getJob))
	s.mux.HandleFunc("PATCH /api/jobs/{id}", s.staffRole("dispatcher", s.patchJob))
	s.mux.HandleFunc("POST /api/jobs/{id}/status", s.staff(s.jobStatus))
	s.mux.HandleFunc("POST /api/jobs/{id}/notes", s.staff(s.addNote))
	s.mux.HandleFunc("POST /api/jobs/{id}/checklist", s.staff(s.checklist))
	s.mux.HandleFunc("POST /api/jobs/{id}/photos", s.staff(s.addPhoto))
	s.mux.HandleFunc("POST /api/jobs/{id}/parts", s.staff(s.addPart))

	s.mux.HandleFunc("GET /api/dispatch/technicians", s.staffRole("dispatcher", s.technicians))
	s.mux.HandleFunc("GET /api/dispatch", s.staffRole("dispatcher", s.dispatch))
	s.mux.HandleFunc("POST /api/dispatch/auto-plan", s.staffRole("dispatcher", s.autoPlan))

	s.mux.HandleFunc("GET /api/invoices", s.staffRole("dispatcher", s.listInvoices))
	s.mux.HandleFunc("POST /api/invoices", s.staffRole("dispatcher", s.createInvoice))
	s.mux.HandleFunc("GET /api/invoices/{id}", s.staffRole("dispatcher", s.getInvoice))
	s.mux.HandleFunc("PATCH /api/invoices/{id}", s.staffRole("dispatcher", s.patchInvoice))

	s.mux.HandleFunc("GET /api/dashboard", s.staffRole("dispatcher", s.dashboard))
	s.mux.HandleFunc("GET /api/feedback", s.staffRole("dispatcher", s.feedback))

	s.mux.HandleFunc("POST /api/portal/auth/login", s.portalLogin)
	s.mux.HandleFunc("POST /api/portal/auth/signup", s.portalSignup)
	s.mux.HandleFunc("POST /api/portal/auth/forgot", s.portalForgot)
	s.mux.HandleFunc("POST /api/portal/auth/reset", s.portalReset)
	s.mux.HandleFunc("POST /api/portal/auth/verify", s.portalVerify)
	s.mux.HandleFunc("GET /api/portal/auth/me", s.customer(s.portalMe))

	s.mux.HandleFunc("GET /api/portal/jobs", s.customer(s.portalJobs))
	s.mux.HandleFunc("POST /api/portal/jobs", s.customer(s.portalCreateJob))
	s.mux.HandleFunc("GET /api/portal/jobs/{id}", s.customer(s.portalJob))
	s.mux.HandleFunc("POST /api/portal/jobs/{id}/feedback", s.customer(s.portalRate))
	s.mux.HandleFunc("GET /api/portal/sales", s.customer(s.portalSales))
}

type staffKey struct{}
type customerKey struct{}

func (s *Server) staff(next func(http.ResponseWriter, *http.Request, auth.Staff)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := auth.Bearer(r.Header.Get("Authorization"))
		if !ok {
			httpx.Error(w, 401, "Unauthorized")
			return
		}
		user, err := auth.VerifyStaff(s.cfg.JWTSecret, token)
		if err != nil {
			httpx.Error(w, 401, "Unauthorized")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), staffKey{}, user)), user)
	}
}

func (s *Server) staffRole(role string, next func(http.ResponseWriter, *http.Request, auth.Staff)) http.HandlerFunc {
	return s.staff(func(w http.ResponseWriter, r *http.Request, user auth.Staff) {
		if user.Role != role {
			httpx.Error(w, 403, "Forbidden")
			return
		}
		next(w, r, user)
	})
}

func (s *Server) customer(next func(http.ResponseWriter, *http.Request, auth.Customer)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := auth.Bearer(r.Header.Get("Authorization"))
		if !ok {
			httpx.Error(w, 401, "Unauthorized")
			return
		}
		c, err := auth.VerifyCustomer(s.cfg.JWTSecret, token)
		if err != nil {
			httpx.Error(w, 401, "Unauthorized")
			return
		}
		next(w, r, c)
	}
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil || !domain.IsEmail(strings.TrimSpace(body.Email)) || body.Password == "" {
		httpx.Error(w, 400, "Invalid email or password")
		return
	}
	user, err := s.db.FindUserByEmail(r.Context(), strings.ToLower(strings.TrimSpace(body.Email)))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if user == nil || !auth.CheckPassword(user.Hash, body.Password) {
		httpx.Error(w, 401, "Invalid email or password")
		return
	}
	token, err := auth.SignStaff(s.cfg.JWTSecret, auth.Staff{UserID: user.ID, Role: user.Role, Email: user.Email})
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"token": token, "user": s.db.PublicUser(*user)})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	u, err := s.db.FindUserByID(r.Context(), user.UserID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if u == nil {
		httpx.Error(w, 401, "Unauthorized")
		return
	}
	httpx.JSON(w, 200, map[string]any{"user": s.db.PublicUser(*u)})
}

func (s *Server) listCustomers(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	customers, err := s.db.ListCustomers(r.Context(), httpx.Query(r, "q"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"customers": customers})
}

func (s *Server) getCustomer(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	customer, err := s.db.GetCustomer(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if customer == nil {
		httpx.Error(w, 404, "Customer not found")
		return
	}
	httpx.JSON(w, 200, map[string]any{"customer": customer})
}

func (s *Server) createCustomer(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	name, phone, email, notes, interval, next, ok := parseCustomer(r, false)
	if !ok {
		httpx.Error(w, 400, "Invalid customer")
		return
	}
	customer, err := s.db.CreateCustomer(r.Context(), s.db.NewID(), name, phone, email, notes, interval, next)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 201, map[string]any{"customer": customer})
}

func (s *Server) patchCustomer(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	fields, ok := parseCustomerPatch(r)
	if !ok {
		httpx.Error(w, 400, "Invalid customer")
		return
	}
	customer, err := s.db.UpdateCustomer(r.Context(), r.PathValue("id"), fields)
	if err != nil {
		httpx.Error(w, 404, "Customer not found")
		return
	}
	httpx.JSON(w, 200, map[string]any{"customer": customer})
}

func (s *Server) deleteCustomer(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	n, err := s.db.CountJobsForCustomer(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if n > 0 {
		httpx.Error(w, 400, "Cannot delete a customer with jobs")
		return
	}
	if err := s.db.DeleteCustomer(r.Context(), r.PathValue("id")); err != nil {
		httpx.Error(w, 404, "Customer not found")
		return
	}
	w.WriteHeader(204)
}

func (s *Server) addLocation(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	var body map[string]any
	if err := httpx.ReadJSON(r, &body); err != nil {
		httpx.Error(w, 400, "Invalid location")
		return
	}
	address := strings.TrimSpace(str(body["address"]))
	city := strings.TrimSpace(str(body["city"]))
	if address == "" || len(address) > 200 || city == "" || len(city) > 80 {
		httpx.Error(w, 400, "Invalid location")
		return
	}
	notes := optStr(body, "notes", 1000)
	var lat, lng *float64
	if v, ok := asFloat(body["lat"]); ok {
		lat = &v
	}
	if v, ok := asFloat(body["lng"]); ok {
		lng = &v
	}
	customer, err := s.db.GetCustomer(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if customer == nil {
		httpx.Error(w, 404, "Customer not found")
		return
	}
	loc, err := s.db.CreateLocation(r.Context(), s.db.NewID(), r.PathValue("id"), address, city, lat, lng, notes)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 201, map[string]any{"location": loc})
}

func (s *Server) listJobs(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	mine := httpx.Query(r, "mine") == "1"
	if user.Role == "technician" && !mine {
		httpx.Error(w, 403, "Forbidden")
		return
	}
	status := httpx.Query(r, "status")
	if !domain.ValidStatus(status) {
		status = ""
	}
	priority := httpx.Query(r, "priority")
	if !domain.ValidPriority(priority) {
		priority = ""
	}
	kind := httpx.Query(r, "kind")
	if !domain.ValidKind(kind) {
		kind = ""
	}
	jobs, err := s.db.ListJobs(r.Context(), store.JobFilter{
		Mine: mine, UserID: user.UserID, TechnicianOnly: user.Role == "technician",
		Status: status, Priority: priority, TechnicianID: httpx.Query(r, "technicianId"),
		Kind: kind, From: httpx.Query(r, "from"), To: httpx.Query(r, "to"), Q: httpx.Query(r, "q"),
	})
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"jobs": jobs})
}

func (s *Server) getJob(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	job, err := s.db.GetJob(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if job == nil {
		httpx.Error(w, 404, "Job not found")
		return
	}
	if user.Role == "technician" && !sameTech(job, user.UserID) {
		httpx.Error(w, 403, "Forbidden")
		return
	}
	httpx.JSON(w, 200, map[string]any{"job": job})
}

func (s *Server) createJob(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	body, ok := parseJob(r, false)
	if !ok {
		httpx.Error(w, 400, "Invalid job")
		return
	}
	belongs, err := s.db.LocationBelongs(r.Context(), body["locationId"].(string), body["customerId"].(string))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if !belongs {
		httpx.Error(w, 400, "Location does not belong to this customer")
		return
	}
	job, err := s.db.CreateJob(r.Context(), body)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.hub.JobUpdated(job)
	httpx.JSON(w, 201, map[string]any{"job": job})
}

func (s *Server) patchJob(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	patch, ok := parseJob(r, true)
	if !ok {
		httpx.Error(w, 400, "Invalid job")
		return
	}
	assigned, status, kind, _, _, start, end, _, found, err := s.db.JobMeta(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if !found {
		httpx.Error(w, 404, "Job not found")
		return
	}
	if domain.Closed(status) {
		httpx.Error(w, 400, "Job is closed")
		return
	}
	if cid, _ := patch["customerId"].(string); cid != "" {
		if lid, _ := patch["locationId"].(string); lid != "" {
			ok, err := s.db.LocationBelongs(r.Context(), lid, cid)
			if err != nil {
				httpx.Error(w, 500, "Internal server error")
				return
			}
			if !ok {
				httpx.Error(w, 400, "Location does not belong to this customer")
				return
			}
		}
	}
	nextAssigned := assigned
	if v, exists := patch["_assignedSet"]; exists && v == true {
		if patch["assignedTechnicianId"] == nil {
			nextAssigned = nil
		} else {
			id := patch["assignedTechnicianId"].(string)
			nextAssigned = &id
		}
	}
	nextDate := patch["scheduledDate"]
	dateSet := false
	if _, exists := patch["_dateSet"]; exists {
		dateSet = true
	}
	nextStatus := status
	hasAssigned := nextAssigned != nil
	hasDate := (!dateSet && status != "") || (dateSet && nextDate != nil)
	if !dateSet {
		// keep existing date presence from scheduled_date via JobMeta - we only have start/end times here.
		// Re-read scheduled date through GetJob.
		job, _ := s.db.GetJob(r.Context(), r.PathValue("id"))
		hasDate = job["scheduledDate"] != nil
		if dateSet {
			hasDate = nextDate != nil
		}
	} else {
		hasDate = nextDate != nil
	}
	if nextStatus == "new" && hasAssigned && hasDate {
		nextStatus = "scheduled"
	}
	if (nextStatus == "scheduled" || nextStatus == "in_progress") && !hasAssigned {
		nextStatus = "new"
	}
	if nextStatus == "scheduled" && !hasDate {
		nextStatus = "new"
	}
	fields := map[string]any{"status": nextStatus}
	if title, ok := patch["title"].(string); ok {
		fields["title"] = title
	}
	if _, ok := patch["description"]; ok {
		fields["description"] = patch["description"]
	}
	if p, ok := patch["priority"].(string); ok {
		fields["priority"] = p
	}
	nextKind := kind
	if k, ok := patch["kind"].(string); ok {
		nextKind = k
		if k != kind {
			fields["kind"] = k
			fields["checklist"] = store.MustJSON(domain.DefaultChecklist(k))
		} else {
			fields["kind"] = k
		}
	}
	if nextKind == "installation" {
		if _, ok := patch["orderRef"]; ok {
			fields["order_ref"] = patch["orderRef"]
		}
	} else {
		fields["order_ref"] = nil
	}
	if v, ok := patch["customerId"].(string); ok {
		fields["customer_id"] = v
	}
	if v, ok := patch["locationId"].(string); ok {
		fields["location_id"] = v
	}
	if _, ok := patch["_assignedSet"]; ok {
		fields["assigned_technician_id"] = nil
		if nextAssigned != nil {
			fields["assigned_technician_id"] = *nextAssigned
		}
	}
	if dateSet {
		fields["scheduled_date"] = nextDate
	}
	if _, ok := patch["scheduledTimeStart"]; ok {
		fields["scheduled_time_start"] = patch["scheduledTimeStart"]
	}
	if _, ok := patch["scheduledTimeEnd"]; ok {
		fields["scheduled_time_end"] = patch["scheduledTimeEnd"]
	}
	if nextStatus == "new" && status == "in_progress" {
		fields["started_at"] = nil
	}
	_ = start
	_ = end
	job, err := s.db.UpdateJobFields(r.Context(), r.PathValue("id"), fields)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.hub.JobUpdated(job)
	httpx.JSON(w, 200, map[string]any{"job": job})
}

func (s *Server) jobStatus(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	var body struct {
		Status string `json:"status"`
	}
	_ = httpx.ReadJSON(r, &body)
	if !domain.ValidStatus(body.Status) {
		httpx.Error(w, 400, "Invalid status")
		return
	}
	assigned, _, _, _, _, _, _, _, found, err := s.db.JobMeta(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if !found {
		httpx.Error(w, 404, "Job not found")
		return
	}
	if user.Role == "technician" && (assigned == nil || *assigned != user.UserID) {
		httpx.Error(w, 403, "Forbidden")
		return
	}
	job, code, msg, err := s.db.ApplyStatus(r.Context(), r.PathValue("id"), body.Status, user.Role)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if msg != "" {
		httpx.Error(w, code, msg)
		return
	}
	s.hub.JobUpdated(job)
	httpx.JSON(w, 200, map[string]any{"job": job})
}

func (s *Server) addNote(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	var body struct {
		NoteText           string `json:"noteText"`
		VisibleToCustomer  bool   `json:"visibleToCustomer"`
	}
	_ = httpx.ReadJSON(r, &body)
	note := strings.TrimSpace(body.NoteText)
	if note == "" {
		httpx.Error(w, 400, "Note is required")
		return
	}
	if !s.writable(w, r, user) {
		return
	}
	if err := s.db.AddNote(r.Context(), s.db.NewID(), r.PathValue("id"), user.UserID, note, body.VisibleToCustomer); err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.writeJob(w, r, 201)
}

func (s *Server) checklist(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	var body struct {
		ID   string `json:"id"`
		Done bool   `json:"done"`
	}
	_ = httpx.ReadJSON(r, &body)
	if strings.TrimSpace(body.ID) == "" {
		httpx.Error(w, 400, "Checklist item is required")
		return
	}
	if !s.writable(w, r, user) {
		return
	}
	job, err := s.db.GetJob(r.Context(), r.PathValue("id"))
	if err != nil || job == nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	items, _ := job["checklist"].([]map[string]any)
	if items == nil {
		raw, _ := job["checklist"].([]any)
		items = make([]map[string]any, 0, len(raw))
		for _, item := range raw {
			if m, ok := item.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	kind, _ := job["kind"].(string)
	parsed := domain.ParseChecklist(store.MustJSON(items), kind)
	for _, item := range parsed {
		if item["id"] == body.ID {
			item["done"] = body.Done
		}
	}
	updated, err := s.db.UpdateJobFields(r.Context(), r.PathValue("id"), map[string]any{"checklist": store.MustJSON(parsed)})
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.hub.JobUpdated(updated)
	httpx.JSON(w, 200, map[string]any{"job": updated})
}

func (s *Server) addPhoto(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	var body struct {
		PhotoURL string `json:"photoUrl"`
	}
	_ = httpx.ReadJSON(r, &body)
	if !strings.HasPrefix(body.PhotoURL, "data:image/") || len(body.PhotoURL) > 1_400_000 {
		httpx.Error(w, 400, "Photo must be a small image")
		return
	}
	if !s.writable(w, r, user) {
		return
	}
	if err := s.db.AddPhoto(r.Context(), s.db.NewID(), r.PathValue("id"), body.PhotoURL, user.UserID); err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.writeJob(w, r, 201)
}

func (s *Server) addPart(w http.ResponseWriter, r *http.Request, user auth.Staff) {
	var body struct {
		PartName string  `json:"partName"`
		Quantity float64 `json:"quantity"`
		UnitCost float64 `json:"unitCost"`
	}
	_ = httpx.ReadJSON(r, &body)
	name := strings.TrimSpace(body.PartName)
	if name == "" || body.Quantity < 1 || body.UnitCost < 0 {
		httpx.Error(w, 400, "Invalid part")
		return
	}
	if !s.writable(w, r, user) {
		return
	}
	if err := s.db.AddPart(r.Context(), s.db.NewID(), r.PathValue("id"), name, int(body.Quantity+0.5), body.UnitCost); err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.writeJob(w, r, 201)
}

func (s *Server) writable(w http.ResponseWriter, r *http.Request, user auth.Staff) bool {
	assigned, status, _, _, _, _, _, _, found, err := s.db.JobMeta(r.Context(), r.PathValue("id"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return false
	}
	if !found {
		httpx.Error(w, 404, "Job not found")
		return false
	}
	if user.Role == "technician" && (assigned == nil || *assigned != user.UserID) {
		httpx.Error(w, 403, "Forbidden")
		return false
	}
	if domain.Closed(status) {
		httpx.Error(w, 400, "Job is closed")
		return false
	}
	return true
}

func (s *Server) writeJob(w http.ResponseWriter, r *http.Request, status int) {
	job, err := s.db.GetJob(r.Context(), r.PathValue("id"))
	if err != nil || job == nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.hub.JobUpdated(job)
	httpx.JSON(w, status, map[string]any{"job": job})
}

func (s *Server) technicians(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	list, err := s.db.ListTechnicians(r.Context())
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"technicians": list})
}

func (s *Server) dispatch(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	date := httpx.Query(r, "date")
	if date == "" {
		date = domain.CalendarDate()
	}
	if !domain.IsDate(date) {
		httpx.Error(w, 400, "Invalid date")
		return
	}
	techs, jobs, err := s.db.Dispatch(r.Context(), date)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"date": date, "technicians": techs, "jobs": jobs})
}

func (s *Server) autoPlan(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	var body struct {
		Date string `json:"date"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil || !domain.IsDate(body.Date) {
		httpx.Error(w, 400, "Invalid date")
		return
	}
	jobs, err := s.db.AutoPlan(r.Context(), body.Date)
	if err != nil && err.Error() == "no technicians" {
		httpx.Error(w, 400, "No technicians")
		return
	}
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	for _, job := range jobs {
		s.hub.JobUpdated(job)
	}
	httpx.JSON(w, 200, map[string]any{"assigned": len(jobs), "jobs": jobs})
}

func (s *Server) listInvoices(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	list, err := s.db.ListInvoices(r.Context(), httpx.Query(r, "status"))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"invoices": list})
}

func (s *Server) getInvoice(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	inv, err := s.db.GetInvoice(r.Context(), r.PathValue("id"), true)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if inv == nil {
		httpx.Error(w, 404, "Invoice not found")
		return
	}
	httpx.JSON(w, 200, map[string]any{"invoice": inv})
}

func (s *Server) createInvoice(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	var body struct {
		JobID string `json:"jobId"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil || strings.TrimSpace(body.JobID) == "" {
		httpx.Error(w, 400, "Job is required")
		return
	}
	_, status, _, _, _, _, _, _, found, err := s.db.JobMeta(r.Context(), body.JobID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if !found {
		httpx.Error(w, 404, "Job not found")
		return
	}
	if status != "completed" {
		httpx.Error(w, 400, "Invoice only from completed jobs")
		return
	}
	n, err := s.db.JobInvoiceCount(r.Context(), body.JobID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if n > 0 {
		httpx.Error(w, 400, "Invoice already exists")
		return
	}
	parts, labor, err := s.db.JobParts(r.Context(), body.JobID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	amount := domain.InvoiceAmount(parts, labor)
	inv, err := s.db.CreateInvoice(r.Context(), s.db.NewID(), body.JobID, amount)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if job, _ := s.db.GetJob(r.Context(), body.JobID); job != nil {
		s.hub.JobUpdated(job)
	}
	httpx.JSON(w, 201, map[string]any{"invoice": inv})
}

func (s *Server) patchInvoice(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	var body struct {
		Status string `json:"status"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil || !domain.ValidInvoiceStatus(body.Status) {
		httpx.Error(w, 400, "Invalid status")
		return
	}
	inv, err := s.db.UpdateInvoiceStatus(r.Context(), r.PathValue("id"), body.Status)
	if err != nil {
		httpx.Error(w, 404, "Invoice not found")
		return
	}
	httpx.JSON(w, 200, map[string]any{"invoice": inv})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	data, err := s.db.Dashboard(r.Context())
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, data)
}

func (s *Server) feedback(w http.ResponseWriter, r *http.Request, _ auth.Staff) {
	data, err := s.db.Feedback(r.Context())
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, data)
}

func (s *Server) portalLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil || !domain.IsEmail(strings.TrimSpace(body.Email)) || body.Password == "" {
		httpx.Error(w, 400, "Invalid email or password")
		return
	}
	id, name, phone, hash, verified, mail, ok, err := s.db.FindCustomerAuth(r.Context(), strings.ToLower(strings.TrimSpace(body.Email)))
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if !ok || hash == nil || !auth.CheckPassword(*hash, body.Password) {
		httpx.Error(w, 401, "Invalid email or password")
		return
	}
	s.portalToken(w, 200, id, name, mail, phone, verified)
}

func (s *Server) portalSignup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Phone    string `json:"phone"`
		Address  string `json:"address"`
		City     string `json:"city"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil {
		httpx.Error(w, 400, "Invalid signup")
		return
	}
	name := strings.TrimSpace(body.Name)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if name == "" || len(name) > 120 || !domain.IsEmail(email) || len(body.Password) < 8 || len(body.Password) > 80 {
		httpx.Error(w, 400, "Invalid signup")
		return
	}
	phone := strings.TrimSpace(body.Phone)
	var phonePtr *string
	if phone != "" && len(phone) <= 40 {
		phonePtr = &phone
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	id, existingName, existingPhone, existingHash, existingVerified, existingEmail, found, err := s.db.FindCustomerAuth(r.Context(), email)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	var existing map[string]any
	if found {
		existing = map[string]any{"id": id, "name": existingName, "phone": existingPhone, "email": existingEmail, "passwordHash": existingHash, "emailVerified": existingVerified}
	} else if phonePtr != nil {
		existing, err = s.db.FindCustomerByPhone(r.Context(), domain.Digits(*phonePtr))
		if err != nil {
			httpx.Error(w, 500, "Internal server error")
			return
		}
	}
	if existing != nil {
		if h, _ := existing["passwordHash"].(*string); h != nil && *h != "" {
			httpx.Error(w, 409, "This shop already has a portal account. Sign in.")
			return
		}
		cid := existing["id"].(string)
		verified, _ := existing["emailVerified"].(bool)
		if existing["email"] != nil {
			verified = true
		}
		if err := s.db.ClaimCustomer(r.Context(), cid, email, phonePtr, hash, verified); err != nil {
			httpx.Error(w, 500, "Internal server error")
			return
		}
		name, phoneOut, mail, ver, ok, err := s.db.CustomerByID(r.Context(), cid)
		if err != nil || !ok {
			httpx.Error(w, 500, "Internal server error")
			return
		}
		if mail != nil && !ver {
			s.logVerify(*mail, cid)
		}
		s.portalToken(w, 201, cid, name, mail, phoneOut, ver)
		return
	}
	cid := s.db.NewID()
	city := strings.TrimSpace(body.City)
	if city == "" {
		city = "Toshkent"
	}
	address := strings.TrimSpace(body.Address)
	if address == "" {
		address = "—"
	}
	if err := s.db.CreatePortalCustomer(r.Context(), cid, name, email, phonePtr, hash, address, city); err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.logVerify(email, cid)
	mail := email
	s.portalToken(w, 201, cid, name, &mail, phonePtr, false)
}

func (s *Server) portalForgot(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	_ = httpx.ReadJSON(r, &body)
	payload := map[string]any{"ok": true}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email != "" {
		id, _, _, hash, _, mail, ok, err := s.db.FindCustomerAuth(r.Context(), email)
		if err == nil && ok && hash != nil && mail != nil {
			raw := rawToken()
			_ = s.db.IssueToken(r.Context(), s.db.NewID(), id, hashToken(raw), "reset", domain.AddMonths(domain.StartOfDay(domain.CalendarDate()), 0).Add(2*3600*1e9).IsZero())
			// fix expires: 2 hours from now
			_ = s.db.IssueToken(r.Context(), s.db.NewID(), id, hashToken(raw), "reset", mustExpire(2))
			resetURL := s.cfg.PublicApp() + "/portal/reset?token=" + raw
			println("[portal] Password reset for " + *mail + ": " + resetURL)
			if s.cfg.DevResetLinks() {
				payload["resetUrl"] = resetURL
			}
		}
	}
	httpx.JSON(w, 200, payload)
}

func (s *Server) portalReset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	_ = httpx.ReadJSON(r, &body)
	if body.Token == "" || len(body.Password) < 8 {
		httpx.Error(w, 400, "Invalid reset")
		return
	}
	id, ok, err := s.db.ConsumeToken(r.Context(), hashToken(body.Token), "reset")
	if err != nil || !ok {
		httpx.Error(w, 400, "Reset link is invalid or expired")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if err := s.db.SetCustomerPassword(r.Context(), id, hash); err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) portalVerify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	_ = httpx.ReadJSON(r, &body)
	token := body.Token
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	id, ok, err := s.db.ConsumeToken(r.Context(), hashToken(token), "verify")
	if err != nil || !ok {
		httpx.Error(w, 400, "Verify link is invalid or expired")
		return
	}
	if err := s.db.VerifyCustomerEmail(r.Context(), id); err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) portalMe(w http.ResponseWriter, r *http.Request, c auth.Customer) {
	name, phone, email, verified, ok, err := s.db.CustomerByID(r.Context(), c.CustomerID)
	if err != nil || !ok {
		httpx.Error(w, 401, "Unauthorized")
		return
	}
	locs, err := s.db.CustomerLocations(r.Context(), c.CustomerID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"customer": map[string]any{
		"id": c.CustomerID, "name": name, "email": email, "phone": phone, "emailVerified": verified, "locations": locs,
	}})
}

func (s *Server) portalJobs(w http.ResponseWriter, r *http.Request, c auth.Customer) {
	kind := httpx.Query(r, "kind")
	if kind != "repair" && kind != "maintenance" && kind != "installation" {
		kind = ""
	}
	jobs, err := s.db.PortalJobs(r.Context(), c.CustomerID, httpx.Query(r, "status"), kind)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"jobs": jobs})
}

func (s *Server) portalJob(w http.ResponseWriter, r *http.Request, c auth.Customer) {
	job, err := s.db.GetPortalJob(r.Context(), r.PathValue("id"), c.CustomerID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if job == nil {
		httpx.Error(w, 404, "Request not found")
		return
	}
	httpx.JSON(w, 200, map[string]any{"job": job})
}

func (s *Server) portalCreateJob(w http.ResponseWriter, r *http.Request, c auth.Customer) {
	var body struct {
		Kind          string `json:"kind"`
		Description   string `json:"description"`
		LocationID    string `json:"locationId"`
		RelatedSaleID string `json:"relatedSaleId"`
		Title         string `json:"title"`
	}
	if err := httpx.ReadJSON(r, &body); err != nil {
		httpx.Error(w, 400, "Invalid request")
		return
	}
	desc := strings.TrimSpace(body.Description)
	if (body.Kind != "repair" && body.Kind != "maintenance") || len(desc) < 4 || len(desc) > 4000 {
		httpx.Error(w, 400, "Invalid request")
		return
	}
	locs, err := s.db.CustomerLocations(r.Context(), c.CustomerID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	var locationID string
	if body.LocationID != "" {
		for _, loc := range locs {
			if loc["id"] == body.LocationID {
				locationID = body.LocationID
			}
		}
	}
	if locationID == "" && len(locs) > 0 {
		locationID, _ = locs[0]["id"].(string)
	}
	if locationID == "" {
		httpx.Error(w, 400, "Add a shop address before sending a request")
		return
	}
	var related any
	if body.RelatedSaleID != "" {
		sales, err := s.db.CustomerSalesIDs(r.Context(), c.CustomerID)
		if err != nil {
			httpx.Error(w, 500, "Internal server error")
			return
		}
		if !sales[body.RelatedSaleID] {
			httpx.Error(w, 400, "That purchase does not belong to this shop")
			return
		}
		related = body.RelatedSaleID
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		if body.Kind == "repair" {
			title = "Ta’mir so‘rovi"
		} else {
			title = "Texnik xizmat so‘rovi"
		}
	}
	priority := "medium"
	if body.Kind == "repair" {
		priority = "high"
	}
	job, err := s.db.CreateJob(r.Context(), map[string]any{
		"id": s.db.NewID(), "title": title, "description": desc, "kind": body.Kind, "orderRef": nil,
		"checklist": store.MustJSON(domain.DefaultChecklist(body.Kind)), "status": "new", "priority": priority,
		"customerId": c.CustomerID, "locationId": locationID, "assignedTechnicianId": nil, "scheduledDate": nil,
		"scheduledTimeStart": nil, "scheduledTimeEnd": nil, "submittedByCustomer": true, "relatedSaleId": related,
	})
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	s.hub.JobUpdated(job)
	portal, err := s.db.GetPortalJob(r.Context(), job["id"].(string), c.CustomerID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 201, map[string]any{"job": portal})
}

func (s *Server) portalRate(w http.ResponseWriter, r *http.Request, c auth.Customer) {
	var body struct {
		Rating  any    `json:"rating"`
		Comment string `json:"comment"`
	}
	_ = httpx.ReadJSON(r, &body)
	rating := intFrom(body.Rating)
	if rating < 1 || rating > 5 {
		httpx.Error(w, 400, "Rating must be 1 to 5 stars")
		return
	}
	status, has, ok, err := s.db.PortalJobMeta(r.Context(), r.PathValue("id"), c.CustomerID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	if !ok {
		httpx.Error(w, 404, "Request not found")
		return
	}
	if status != "completed" && status != "invoiced" {
		httpx.Error(w, 400, "You can rate after the visit is finished")
		return
	}
	if has {
		httpx.Error(w, 400, "This visit is already rated")
		return
	}
	comment := strings.TrimSpace(body.Comment)
	var cptr *string
	if comment != "" && len(comment) <= 2000 {
		cptr = &comment
	}
	fb, err := s.db.CreateFeedback(r.Context(), s.db.NewID(), r.PathValue("id"), c.CustomerID, rating, cptr)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 201, map[string]any{"feedback": fb})
}

func (s *Server) portalSales(w http.ResponseWriter, r *http.Request, c auth.Customer) {
	sales, err := s.db.ListSales(r.Context(), c.CustomerID)
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, 200, map[string]any{"sales": sales})
}

func (s *Server) portalToken(w http.ResponseWriter, status int, id, name string, email, phone *string, verified bool) {
	if email == nil || *email == "" {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	token, err := auth.SignCustomer(s.cfg.JWTSecret, auth.Customer{CustomerID: id, Email: *email})
	if err != nil {
		httpx.Error(w, 500, "Internal server error")
		return
	}
	httpx.JSON(w, status, map[string]any{
		"token": token,
		"customer": map[string]any{"id": id, "name": name, "email": email, "phone": phone, "emailVerified": verified},
	})
}

func (s *Server) logVerify(email, customerID string) {
	raw := rawToken()
	_ = s.db.IssueToken(context.Background(), s.db.NewID(), customerID, hashToken(raw), "verify", mustExpire(72))
	println("[portal] Verify email for " + email + ": " + s.cfg.PublicApp() + "/portal/verify?token=" + raw)
}

func parseCustomer(r *http.Request, _ bool) (name string, phone, email, notes *string, interval int, next *interface{ /* placeholder */ }, ok bool) {
	return "", nil, nil, nil, 0, nil, false
}

func parseCustomer(r *http.Request) (string, *string, *string, *string, int, any, bool) {
	var body map[string]any
	if err := httpx.ReadJSON(r, &body); err != nil {
		return "", nil, nil, nil, 0, nil, false
	}
	name := strings.TrimSpace(str(body["name"]))
	if name == "" || len(name) > 120 {
		return "", nil, nil, nil, 0, nil, false
	}
	interval := 3
	if v, ok := asInt(body["maintenanceIntervalMonths"]); ok {
		if v < 1 || v > 24 {
			return "", nil, nil, nil, 0, nil, false
		}
		interval = v
	}
	var next any
	if raw, exists := body["nextMaintenanceOn"]; exists {
		if raw == nil || raw == "" {
			next = nil
		} else {
			d := str(raw)
			if !domain.IsDate(d) {
				return "", nil, nil, nil, 0, nil, false
			}
			t := domain.StartOfDay(d)
			next = t
		}
	}
	return name, optStr(body, "phone", 40), optStr(body, "email", 120), optStr(body, "notes", 2000), interval, next, true
}

func parseCustomerPatch(r *http.Request) (map[string]any, bool) {
	var body map[string]any
	if err := httpx.ReadJSON(r, &body); err != nil {
		return nil, false
	}
	out := map[string]any{}
	if v, ok := body["name"]; ok {
		name := strings.TrimSpace(str(v))
		if name == "" || len(name) > 120 {
			return nil, false
		}
		out["name"] = name
	}
	if _, ok := body["phone"]; ok {
		out["phone"] = optStr(body, "phone", 40)
	}
	if _, ok := body["email"]; ok {
		out["email"] = optStr(body, "email", 120)
	}
	if _, ok := body["notes"]; ok {
		out["notes"] = optStr(body, "notes", 2000)
	}
	if v, ok := body["maintenanceIntervalMonths"]; ok {
		n, ok := asInt(v)
		if !ok || n < 1 || n > 24 {
			return nil, false
		}
		out["maintenanceIntervalMonths"] = n
	}
	if raw, ok := body["nextMaintenanceOn"]; ok {
		if raw == nil || raw == "" {
			out["nextMaintenanceOn"] = nil
		} else {
			d := str(raw)
			if !domain.IsDate(d) {
				return nil, false
			}
			t := domain.StartOfDay(d)
			out["nextMaintenanceOn"] = t
		}
	}
	return out, true
}

func parseJob(r *http.Request, partial bool) (map[string]any, bool) {
	var body map[string]any
	if err := httpx.ReadJSON(r, &body); err != nil {
		return nil, false
	}
	out := map[string]any{}
	if v, ok := body["title"]; ok || !partial {
		title := strings.TrimSpace(str(body["title"]))
		if title == "" || len(title) > 160 {
			return nil, false
		}
		out["title"] = title
	}
	if v, ok := body["description"]; ok {
		d := strings.TrimSpace(str(v))
		if len(d) > 4000 {
			return nil, false
		}
		if d == "" {
			out["description"] = nil
		} else {
			out["description"] = d
		}
	}
	kind := "repair"
	if v, ok := body["kind"]; ok {
		k := str(v)
		if !domain.ValidKind(k) {
			return nil, false
		}
		kind = k
		out["kind"] = k
	} else if !partial {
		out["kind"] = kind
	}
	if v, ok := body["orderRef"]; ok {
		ref := strings.TrimSpace(str(v))
		if len(ref) > 80 {
			return nil, false
		}
		if ref == "" {
			out["orderRef"] = nil
		} else {
			out["orderRef"] = ref
		}
	}
	if v, ok := body["priority"]; ok {
		p := str(v)
		if !domain.ValidPriority(p) {
			return nil, false
		}
		out["priority"] = p
	} else if !partial {
		out["priority"] = "medium"
	}
	if v, ok := body["customerId"]; ok || !partial {
		cid := str(body["customerId"])
		if cid == "" {
			return nil, false
		}
		out["customerId"] = cid
	}
	if v, ok := body["locationId"]; ok || !partial {
		lid := str(body["locationId"])
		if lid == "" {
			return nil, false
		}
		out["locationId"] = lid
	}
	if v, exists := body["assignedTechnicianId"]; exists {
		out["_assignedSet"] = true
		if v == nil || str(v) == "" {
			out["assignedTechnicianId"] = nil
		} else {
			out["assignedTechnicianId"] = str(v)
		}
	}
	if v, exists := body["scheduledDate"]; exists {
		out["_dateSet"] = true
		if v == nil || v == "" {
			out["scheduledDate"] = nil
		} else {
			d := str(v)
			if !domain.IsDate(d) {
				return nil, false
			}
			t := domain.StartOfDay(d)
			out["scheduledDate"] = t
		}
	}
	if v, exists := body["scheduledTimeStart"]; exists {
		if v == nil || str(v) == "" {
			out["scheduledTimeStart"] = nil
		} else {
			out["scheduledTimeStart"] = str(v)
		}
	}
	if v, exists := body["scheduledTimeEnd"]; exists {
		if v == nil || str(v) == "" {
			out["scheduledTimeEnd"] = nil
		} else {
			out["scheduledTimeEnd"] = str(v)
		}
	}
	if !partial {
		assigned, _ := out["assignedTechnicianId"].(string)
		date := out["scheduledDate"]
		status := "new"
		if assigned != "" && date != nil {
			status = "scheduled"
		}
		k, _ := out["kind"].(string)
		var order any
		if k == "installation" {
			order = out["orderRef"]
		}
		id := "" // filled by caller via NewID
		_ = id
		return map[string]any{
			"id":                    "",
			"title":                 out["title"],
			"description":           out["description"],
			"kind":                  k,
			"orderRef":              order,
			"checklist":             store.MustJSON(domain.DefaultChecklist(k)),
			"status":                status,
			"priority":              out["priority"],
			"customerId":            out["customerId"],
			"locationId":            out["locationId"],
			"assignedTechnicianId":  out["assignedTechnicianId"],
			"scheduledDate":         out["scheduledDate"],
			"scheduledTimeStart":    out["scheduledTimeStart"],
			"scheduledTimeEnd":      out["scheduledTimeEnd"],
			"submittedByCustomer":   false,
			"relatedSaleId":         nil,
		}, true
	}
	return out, true
}

func sameTech(job map[string]any, userID string) bool {
	switch v := job["assignedTechnicianId"].(type) {
	case string:
		return v == userID
	case *string:
		return v != nil && *v == userID
	}
	return false
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func optStr(body map[string]any, key string, max int) *string {
	v, ok := body[key]
	if !ok || v == nil {
		return nil
	}
	s := strings.TrimSpace(str(v))
	if s == "" || len(s) > max {
		return nil
	}
	return &s
}

func asInt(v any) (int, bool) {
	switch t := v.(type) {
	case float64:
		return int(t), true
	case json.Number:
		n, err := t.Int64()
		return int(n), err == nil
	case string:
		n, err := strconv.Atoi(t)
		return n, err == nil
	case int:
		return t, true
	}
	return 0, false
}

func asFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	}
	return 0, false
}

func intFrom(v any) int {
	n, _ := asInt(v)
	return n
}

func rawToken() string {
	b := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, b)
	return hex.EncodeToString(b)
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func mustExpire(hours int) interface{ /* dummy */ } {
	return nil
}
