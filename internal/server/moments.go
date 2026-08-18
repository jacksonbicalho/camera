package server

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"camera/internal/db"
)

// handleMoments lista "momentos" (eventos de movimento) de TODAS as câmeras acessíveis ao
// usuário num dia, para o navegador global de gravações (/recordings). Ordena por tempo
// desc e pagina. Filtros opcionais: `cameras` (csv de ids) e `category` (movimento|
// pessoa|ia). Cada momento aponta para a câmera + instante, e o frontend abre a
// CameraPage ali (deep-link de seek).
func (s *Server) handleMoments(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}
	localDay, err := time.ParseInLocation("2006-01-02", r.URL.Query().Get("date"), loc)
	if err != nil {
		http.Error(w, "invalid date", http.StatusBadRequest)
		return
	}
	dayStart := localDay.UTC()
	dayEnd := localDay.Add(24 * time.Hour).UTC()

	cams, err := db.ListCameras(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	ac, _ := r.Context().Value(claimsKey).(authClaims)
	allowed := map[string]struct{}{}
	if ac.Role != "admin" {
		if ids, err := db.GetUserCameras(s.db, ac.UserID); err == nil {
			for _, id := range ids {
				allowed[id] = struct{}{}
			}
		}
	}
	var camFilter map[string]struct{}
	if cv := r.URL.Query().Get("cameras"); cv != "" {
		camFilter = map[string]struct{}{}
		for _, id := range strings.Split(cv, ",") {
			camFilter[strings.TrimSpace(id)] = struct{}{}
		}
	}
	var catFilter map[string]struct{}
	if cv := r.URL.Query().Get("category"); cv != "" {
		catFilter = map[string]struct{}{}
		for _, c := range strings.Split(cv, ",") {
			catFilter[strings.TrimSpace(c)] = struct{}{}
		}
	}
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	type moment struct {
		CameraID           string  `json:"camera_id"`
		CameraName         string  `json:"camera_name"`
		Time               string  `json:"time"`
		Kind               string  `json:"kind"`
		Label              string  `json:"label,omitempty"`
		Category           string  `json:"category"`
		Frame              string  `json:"frame,omitempty"`
		Score              float64 `json:"score"`
		RecordingAvailable bool    `json:"recording_available"`
	}
	// matchesQuery casa o termo de busca (já normalizado) por substring contra a label
	// ou o nome da categoria do momento. query vazia casa tudo.
	matchesQuery := func(label, category string) bool {
		if query == "" {
			return true
		}
		return strings.Contains(strings.ToLower(label), query) ||
			strings.Contains(strings.ToLower(category), query)
	}

	moments := []moment{}
	// categories é o universo de categorias do dia (respeitando `cameras`/permissão),
	// SEM aplicar catFilter/q — os chips do frontend usam isso pra nunca sumir quando
	// outro filtro de categoria está ativo (ver story fix-chips-categoria-somem-multiselecao).
	categories := map[string]struct{}{}
	for _, c := range cams {
		if ac.Role != "admin" {
			if _, ok := allowed[c.ID]; !ok {
				continue
			}
		}
		if camFilter != nil {
			if _, ok := camFilter[c.ID]; !ok {
				continue
			}
		}
		// Uma consulta por câmera (não por momento) — sem I/O de arquivo, só
		// started_at/ended_at, cruzados em memória contra cada evento/transição
		// abaixo. ended_at real (não mais inflado pelo início do próximo chunk,
		// ver história fix/ended-at-duracao-real) é o que torna esse cálculo
		// confiável. ListRecordingsInRange filtra por started_at >= start — sem
		// alargar o limite inferior, o chunk que começou ANTES da meia-noite local
		// e ainda cobre os primeiros minutos do dia consultado (aberto ou recém-
		// fechado) ficaria de fora, gerando falso "sem gravação" pra eventos logo
		// após a virada do dia (achado do code review, confirmado: acontece todo
		// dia, pra toda câmera ativa, dado o chunk_duration default).
		recs, err := db.ListRecordingsInRange(
			s.db, []string{c.ID}, dayStart.Add(-c.EffectiveChunkDuration()), dayEnd, false,
		)
		if err != nil {
			recs = nil
		}
		mc := c.EffectiveMotionConfig()
		lead := mc.PlaybackLeadSeconds
		if lead <= 0 {
			lead = 10
		}
		trail := mc.PlaybackTrailSeconds
		if trail <= 0 {
			trail = 10
		}
		if evs, err := db.ListMotionEvents(s.db, c.ID, dayStart, dayEnd); err == nil {
			for _, e := range evs {
				cat := db.MotionCategory(e.Label)
				categories[cat] = struct{}{}
				if catFilter != nil {
					if _, ok := catFilter[cat]; !ok {
						continue
					}
				}
				if !matchesQuery(e.Label, cat) {
					continue
				}
				moments = append(moments, moment{
					CameraID: c.ID, CameraName: c.Name, Time: e.OccurredAt.UTC().Format(time.RFC3339),
					Kind: "motion", Label: e.Label, Category: cat, Frame: e.FramePath, Score: e.Score,
					RecordingAvailable: recordingCoversWindow(recs, e.OccurredAt, lead, trail),
				})
			}
		}
	}
	sort.Slice(moments, func(i, j int) bool { return moments[i].Time > moments[j].Time })
	catList := make([]string, 0, len(categories))
	for c := range categories {
		catList = append(catList, c)
	}
	sort.Strings(catList)

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 {
		limit = 100
	}
	total := len(moments)
	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}
	writeJSON(w, map[string]any{
		"moments":    moments[start:end],
		"total":      total,
		"hasMore":    end < total,
		"categories": catList,
	})
}

// recordingCoversWindow reports whether any recording overlaps
// [occurred-lead, occurred+trail] — same formula internal/storage/cleaner.go
// already uses to associate has_motion. A recording with a zero EndedAt (still
// open) is treated as covering up to and beyond "now", same as ended_at IS
// NULL in ListStateHistory (internal/db/state_classifiers.go).
func recordingCoversWindow(recs []db.Recording, occurred time.Time, leadSec, trailSec int) bool {
	winStart := occurred.Add(-time.Duration(leadSec) * time.Second)
	winEnd := occurred.Add(time.Duration(trailSec) * time.Second)
	for _, r := range recs {
		if r.StartedAt.Before(winEnd) && (r.EndedAt.IsZero() || r.EndedAt.After(winStart)) {
			return true
		}
	}
	return false
}
