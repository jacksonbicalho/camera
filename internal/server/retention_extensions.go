package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

type retentionExtensionDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Endpoint string `json:"endpoint"`
	Bucket   string `json:"bucket"`
	Region   string `json:"region"`
	// AccessKey and SecretKey are write-only: never returned in responses.
	Prefix string `json:"prefix"`
}

func retentionExtensionToDTO(re db.RetentionExtension) retentionExtensionDTO {
	return retentionExtensionDTO{
		ID:       re.ID,
		Name:     re.Name,
		Type:     re.Type,
		Endpoint: re.Endpoint,
		Bucket:   re.Bucket,
		Region:   re.Region,
		Prefix:   re.Prefix,
	}
}

func (s *Server) handleListRetentionExtensions(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	list, err := db.ListRetentionExtensions(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	out := make([]retentionExtensionDTO, len(list))
	for i, re := range list {
		out[i] = retentionExtensionToDTO(re)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// handleCreateRetentionExtension rejeita (409) uma 2ª criação — S3 é
// singleton (decisão do navigator, ver work_progress/analysis): só 1
// retention_extension pode existir por vez.
func (s *Server) handleCreateRetentionExtension(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var input struct {
		Name      string `json:"name"`
		Type      string `json:"type"`
		Endpoint  string `json:"endpoint"`
		Bucket    string `json:"bucket"`
		Region    string `json:"region"`
		AccessKey string `json:"access_key"`
		SecretKey string `json:"secret_key"`
		Prefix    string `json:"prefix"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Name == "" || input.Bucket == "" || input.AccessKey == "" || input.SecretKey == "" {
		http.Error(w, "name, bucket, access_key and secret_key are required", http.StatusBadRequest)
		return
	}
	extType := input.Type
	if extType == "" {
		extType = "s3"
	}
	if extType != "s3" {
		http.Error(w, "unsupported retention extension type", http.StatusBadRequest)
		return
	}
	if has, err := db.HasRetentionExtension(s.db); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	} else if has {
		http.Error(w, "já existe uma extensão de retenção configurada", http.StatusConflict)
		return
	}
	re := db.RetentionExtension{
		Name:      input.Name,
		Type:      extType,
		Endpoint:  input.Endpoint,
		Bucket:    input.Bucket,
		Region:    input.Region,
		AccessKey: input.AccessKey,
		SecretKey: input.SecretKey,
		Prefix:    input.Prefix,
	}
	created, err := db.InsertRetentionExtension(s.db, re)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(retentionExtensionToDTO(created))
}

func (s *Server) handleUpdateRetentionExtension(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id := r.PathValue("id")
	existing, err := db.GetRetentionExtension(s.db, id)
	if err != nil {
		http.Error(w, "retention extension not found", http.StatusNotFound)
		return
	}
	var input struct {
		Name      string `json:"name"`
		Endpoint  string `json:"endpoint"`
		Bucket    string `json:"bucket"`
		Region    string `json:"region"`
		AccessKey string `json:"access_key"`
		SecretKey string `json:"secret_key"`
		Prefix    string `json:"prefix"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Name != "" {
		existing.Name = input.Name
	}
	existing.Endpoint = input.Endpoint
	existing.Bucket = input.Bucket
	existing.Region = input.Region
	existing.Prefix = input.Prefix
	// Only update credentials if explicitly provided.
	if input.AccessKey != "" {
		existing.AccessKey = input.AccessKey
	}
	if input.SecretKey != "" {
		existing.SecretKey = input.SecretKey
	}
	if err := db.UpdateRetentionExtension(s.db, existing); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(retentionExtensionToDTO(existing))
}

func (s *Server) handleDeleteRetentionExtension(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id := r.PathValue("id")
	if err := db.DeleteRetentionExtension(s.db, id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListRetentionConfigs(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	configs, err := db.ListRetentionConfigs(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func (s *Server) handleUpdateRetentionConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	category := r.PathValue("category")
	if category != "with_motion" && category != "without_motion" {
		http.Error(w, "invalid category", http.StatusBadRequest)
		return
	}
	var input struct {
		Action               string `json:"action"`
		RetentionExtensionID string `json:"retention_extension_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Action != "delete" && input.Action != "send_to_drive" {
		http.Error(w, "action must be 'delete' or 'send_to_drive'", http.StatusBadRequest)
		return
	}
	if input.Action == "send_to_drive" && input.RetentionExtensionID == "" {
		http.Error(w, "retention_extension_id required for send_to_drive action", http.StatusBadRequest)
		return
	}
	rc := db.RetentionConfig{
		Category:             category,
		Action:               input.Action,
		RetentionExtensionID: input.RetentionExtensionID,
	}
	if err := db.UpdateRetentionConfig(s.db, rc); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rc)
}
