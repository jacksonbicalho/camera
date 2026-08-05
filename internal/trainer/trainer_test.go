package trainer_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/analysis"
	"camera/internal/trainer"
)

// TestTrainerAdapterPattern covers the story feat(analysis): trainer
// adapter pattern (yolo).
func TestTrainerAdapterPattern(t *testing.T) {
	t.Run("CA2: New(\"yolo\", cfg) despacha pro adapter YOLO — Train/Status/Cancel via o mesmo contrato HTTP do finetune de hoje", func(t *testing.T) {
		var gotTrainPath, gotStatusPath, gotCancelPath string
		var gotMethod string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodPost && r.URL.Path == "/finetune":
				gotTrainPath = r.URL.Path
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"job_id":"job-123"}`))
			case r.Method == http.MethodGet && r.URL.Path == "/finetune/status/job-123":
				gotStatusPath = r.URL.Path
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"running","epoch":2,"total_epochs":20}`))
			case r.Method == http.MethodDelete && r.URL.Path == "/finetune/job-123":
				gotCancelPath = r.URL.Path
				gotMethod = r.Method
				w.WriteHeader(http.StatusOK)
			default:
				http.NotFound(w, r)
			}
		}))
		defer srv.Close()

		tr, err := trainer.New("yolo", map[string]string{"service_url": srv.URL})
		if err != nil {
			t.Fatalf("New: %v", err)
		}

		jobID, err := tr.Train(context.Background(), analysis.FinetuneRequest{
			Annotations: []analysis.AnnotationItem{{ImagePath: "/tmp/a.jpg", Label: "person"}},
			BaseModel:   "yolov8n",
			Epochs:      10,
		})
		if err != nil {
			t.Fatalf("Train: %v", err)
		}
		if jobID != "job-123" {
			t.Fatalf("expected job-123, got %q", jobID)
		}
		if gotTrainPath != "/finetune" {
			t.Fatalf("expected POST /finetune, got %q", gotTrainPath)
		}

		status, err := tr.Status(context.Background(), jobID)
		if err != nil {
			t.Fatalf("Status: %v", err)
		}
		if status.Status != "running" || status.Epoch != 2 {
			t.Fatalf("unexpected status: %+v", status)
		}
		if gotStatusPath != "/finetune/status/job-123" {
			t.Fatalf("expected GET /finetune/status/job-123, got %q", gotStatusPath)
		}

		if err := tr.Cancel(context.Background(), jobID); err != nil {
			t.Fatalf("Cancel: %v", err)
		}
		if gotCancelPath != "/finetune/job-123" || gotMethod != http.MethodDelete {
			t.Fatalf("expected DELETE /finetune/job-123, got %q %q", gotMethod, gotCancelPath)
		}
	})

	t.Run("CA2: New(\"yolo\", cfg) sem service_url retorna erro", func(t *testing.T) {
		if _, err := trainer.New("yolo", map[string]string{}); err == nil {
			t.Fatal("expected error for yolo config missing service_url")
		}
	})

	t.Run("CA2: New(\"\", cfg) trata string vazia como yolo (compat com futuros registros legados)", func(t *testing.T) {
		if _, err := trainer.New("", map[string]string{"service_url": "http://yolo:8000"}); err != nil {
			t.Fatalf("expected empty type to be treated as yolo, got error: %v", err)
		}
	})

	t.Run("CA2: New(\"desconhecido\", cfg) retorna erro", func(t *testing.T) {
		if _, err := trainer.New("desconhecido", map[string]string{}); err == nil {
			t.Fatal("expected error for unknown trainer type")
		}
	})
}
