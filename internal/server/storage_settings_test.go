package server_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

func TestValidacaoStorageNegativo(t *testing.T) {
	t.Run("CA2: backend rejeita valores negativos/fora de faixa nos campos de armazenamento", func(t *testing.T) {
		cases := []struct {
			name    string
			payload map[string]any
			wantMsg string
		}{
			{"with_motion_minutes negativo", map[string]any{"with_motion_minutes": -5}, "with_motion_minutes"},
			{"without_motion_minutes negativo", map[string]any{"without_motion_minutes": -1}, "without_motion_minutes"},
			{"interval_minutes negativo", map[string]any{"interval_minutes": -10}, "interval_minutes"},
			{"max_size_gb negativo", map[string]any{"max_size_gb": -0.5}, "max_size_gb"},
			{"warn_percent negativo", map[string]any{"warn_percent": -1}, "warn_percent"},
			{"warn_percent acima de 100", map[string]any{"warn_percent": 101}, "warn_percent"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
				srv = withTestUsers(t, srv)
				token := loginAndGetToken(t, srv, "admin", "pw")

				w := doJSON(t, srv, http.MethodPut, "/api/settings/storage", token, tc.payload)
				if w.Code != http.StatusBadRequest {
					t.Fatalf("expected 400, got %d (body: %s)", w.Code, w.Body.String())
				}
				if !strings.Contains(w.Body.String(), tc.wantMsg) {
					t.Errorf("expected error body to mention %q, got %q", tc.wantMsg, w.Body.String())
				}

				get := doJSON(t, srv, http.MethodGet, "/api/settings", token, nil)
				var resp struct {
					Storage struct {
						WithMotionMinutes    int     `json:"with_motion_minutes"`
						WithoutMotionMinutes int     `json:"without_motion_minutes"`
						IntervalMinutes      int     `json:"interval_minutes"`
						MaxSizeGB            float64 `json:"max_size_gb"`
						WarnPercent          float64 `json:"warn_percent"`
					} `json:"storage"`
				}
				if err := json.NewDecoder(get.Body).Decode(&resp); err != nil {
					t.Fatalf("decode /api/settings: %v", err)
				}
				if resp.Storage.WithMotionMinutes != 10080 {
					t.Errorf("with_motion_minutes deveria continuar no default 10080 (rejeitado, não persistiu), got %d", resp.Storage.WithMotionMinutes)
				}
				if resp.Storage.WithoutMotionMinutes != 1440 {
					t.Errorf("without_motion_minutes deveria continuar no default 1440 (rejeitado, não persistiu), got %d", resp.Storage.WithoutMotionMinutes)
				}
				if resp.Storage.IntervalMinutes != 60 {
					t.Errorf("interval_minutes deveria continuar no default 60 (rejeitado, não persistiu), got %d", resp.Storage.IntervalMinutes)
				}
				if resp.Storage.MaxSizeGB != 0 {
					t.Errorf("max_size_gb deveria continuar no default 0 (rejeitado, não persistiu), got %v", resp.Storage.MaxSizeGB)
				}
				if resp.Storage.WarnPercent != 70 {
					t.Errorf("warn_percent deveria continuar no default 70 (rejeitado, não persistiu), got %v", resp.Storage.WarnPercent)
				}
			})
		}
	})
}
