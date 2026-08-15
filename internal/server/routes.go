package server

import "net/http"

// authLevel is the access each route requires. Keeping it as data (instead of
// hand-wrapping every registration in a middleware) lets routes() derive the
// middleware from a single declarative table.
type authLevel int

const (
	// authPublic is unauthenticated: login, password recovery, client config.
	authPublic authLevel = iota
	// authChangePassword accepts a token still carrying must_change_password.
	authChangePassword
	// authFull requires a token whose password change is already done.
	authFull
	// authAdmin additionally requires role=admin.
	authAdmin
	// authCamera requires access to the camera in the {id} path value.
	authCamera
)

func (a authLevel) String() string {
	switch a {
	case authPublic:
		return "public"
	case authChangePassword:
		return "change-password"
	case authFull:
		return "full"
	case authAdmin:
		return "admin"
	case authCamera:
		return "camera"
	}
	return "unknown"
}

type route struct {
	method  string
	path    string
	auth    authLevel
	handler http.HandlerFunc
}

// guard returns the handler wrapped in the middleware its auth level demands.
func (s *Server) guard(rt route) http.HandlerFunc {
	switch rt.auth {
	case authChangePassword:
		return s.requireAuth(rt.handler)
	case authFull:
		return s.requireFullAuth(rt.handler)
	case authAdmin:
		return s.requireAdmin(rt.handler)
	case authCamera:
		return s.requireCameraAccess(rt.handler)
	}
	return rt.handler
}

// routeTable is the single source of truth for the /api surface.
//
// Prefix-mounted file handlers (/stream/, /recordings/) and the SPA fallback
// are not http.HandlerFunc and stay in routes().
func (s *Server) routeTable() []route {
	return []route{
		{"POST", "/api/auth/login", authPublic, s.handleLogin},
		{"POST", "/api/auth/change-password", authChangePassword, s.handleChangePassword},
		{"POST", "/api/auth/forgot-password", authPublic, s.handleForgotPassword},
		{"POST", "/api/auth/reset-password", authPublic, s.handleResetPassword},
		{"GET", "/api/config", authPublic, s.handleClientConfig},
		{"GET", "/api/settings", authAdmin, s.handleSettings},
		{"GET", "/api/about", authFull, s.handleAbout},
		{"GET", "/api/updates", authAdmin, s.handleUpdates},
		{"POST", "/api/updates/apply", authAdmin, s.handleApplyUpdate},
		{"GET", "/api/cameras", authFull, s.handleCameras},

		{"GET", "/api/discover", authAdmin, s.handleDiscover},
		{"POST", "/api/discover/streams", authAdmin, s.handleDiscoverStreams},
		{"GET", "/api/settings/cameras", authAdmin, s.handleListSettingsCameras},
		{"POST", "/api/settings/cameras", authAdmin, s.handleCreateCamera},
		{"POST", "/api/settings/cameras/detect-substream", authAdmin, s.handleDetectSubstream},
		{"POST", "/api/settings/cameras/detect-streams", authAdmin, s.handleDetectStreams},
		{"PUT", "/api/settings/cameras/reorder", authAdmin, s.handleReorderCameras},
		{"PUT", "/api/settings/cameras/{id}", authAdmin, s.handleUpdateCamera},
		{"DELETE", "/api/settings/cameras/{id}", authAdmin, s.handleDeleteCamera},

		// Notifications are per-user (scoped to the authenticated user, not admin-only).
		{"GET", "/api/notifications", authFull, s.handleListNotifications},
		{"POST", "/api/notifications/read-all", authFull, s.handleMarkAllNotificationsRead},
		{"POST", "/api/notifications/{id}/read", authFull, s.handleMarkNotificationRead},
		{"DELETE", "/api/notifications/{id}", authFull, s.handleDeleteNotification},
		{"DELETE", "/api/notifications", authFull, s.handleDeleteAllNotifications},

		// Per-user preferences (theme), scoped to the authenticated user.
		{"GET", "/api/me/footer-states", authFull, s.handleFooterStates},
		{"GET", "/api/me/preferences", authFull, s.handleGetPreferences},
		{"PUT", "/api/me/preferences", authFull, s.handleUpdatePreferences},
		{"POST", "/api/me/telegram/link", authFull, s.handleTelegramLink},
		{"POST", "/api/me/telegram/unlink", authFull, s.handleTelegramUnlink},

		// Perfil: dados do usuário + troca de e-mail com código de confirmação.
		{"GET", "/api/me", authFull, s.handleGetMe},
		{"PUT", "/api/me", authFull, s.handleUpdateMe},
		{"POST", "/api/me/email/request-change", authFull, s.handleRequestEmailChange},
		{"POST", "/api/me/email/confirm-change", authFull, s.handleConfirmEmailChange},

		{"GET", "/api/users", authAdmin, s.handleListUsers},
		{"POST", "/api/users", authAdmin, s.handleCreateUser},
		{"PUT", "/api/users/{id}", authAdmin, s.handleUpdateUser},
		{"DELETE", "/api/users/{id}", authAdmin, s.handleDeleteUser},

		{"PUT", "/api/settings/storage", authAdmin, s.handleUpdateStorageSettings},

		{"GET", "/api/settings/extensions", authAdmin, s.handleGetExtensionsConfig},
		{"PUT", "/api/settings/extensions/{id}", authAdmin, s.handleUpdateExtensionConfig},

		{"GET", "/api/retention-extensions", authAdmin, s.handleListRetentionExtensions},
		{"POST", "/api/retention-extensions", authAdmin, s.handleCreateRetentionExtension},
		{"PUT", "/api/retention-extensions/{id}", authAdmin, s.handleUpdateRetentionExtension},
		{"DELETE", "/api/retention-extensions/{id}", authAdmin, s.handleDeleteRetentionExtension},
		{"GET", "/api/retention", authAdmin, s.handleListRetentionConfigs},
		{"PUT", "/api/retention/{category}", authAdmin, s.handleUpdateRetentionConfig},

		{"GET", "/api/settings/analysis", authAdmin, s.handleGetAnalysisConfig},
		{"PUT", "/api/settings/analysis", authAdmin, s.handleUpdateAnalysisConfig},
		{"POST", "/api/settings/analysis/reanalyze", authAdmin, s.handleReanalyze},
		{"POST", "/api/settings/analysis/finetune", authAdmin, s.handleStartFinetune},
		{"DELETE", "/api/settings/analysis/finetune/{job_id}", authAdmin, s.handleCancelFinetune},
		{"GET", "/api/settings/analysis/finetune/status/{job_id}", authAdmin, s.handleFinetuneStatus},
		{"GET", "/api/settings/cameras/{id}/analysis", authAdmin, s.handleGetCameraAnalysisConfig},
		{"PUT", "/api/settings/cameras/{id}/analysis", authAdmin, s.handleUpdateCameraAnalysisConfig},

		{"GET", "/api/settings/detectors", authAdmin, s.handleListDetectors},
		{"POST", "/api/settings/detectors", authAdmin, s.handleCreateDetector},
		{"PUT", "/api/settings/detectors/{id}", authAdmin, s.handleUpdateDetector},
		{"DELETE", "/api/settings/detectors/{id}", authAdmin, s.handleDeleteDetector},
		{"POST", "/api/settings/detectors/{id}/test", authAdmin, s.handleTestDetector},

		{"GET", "/api/settings/trainers", authAdmin, s.handleListTrainers},
		{"POST", "/api/settings/trainers", authAdmin, s.handleCreateTrainer},
		{"PUT", "/api/settings/trainers/{id}", authAdmin, s.handleUpdateTrainer},
		{"DELETE", "/api/settings/trainers/{id}", authAdmin, s.handleDeleteTrainer},

		{"GET", "/api/cameras/{id}/recordings", authCamera, s.handleRecordings},
		{"GET", "/api/cameras/{id}/content-days", authCamera, s.handleContentDays},
		{"GET", "/api/cameras/{id}/recordings/by-id/{recording_id}", authCamera, s.handleRecordingByID},
		{"DELETE", "/api/cameras/{id}/recordings/{filename}", authAdmin, s.handleDeleteRecording},
		{"GET", "/api/reports/events", authFull, s.handleEventReport},
		{"GET", "/api/moments", authFull, s.handleMoments},
		{"GET", "/api/recordings", authFull, s.handleGlobalRecordings},
		{"GET", "/api/content-days", authFull, s.handleGlobalContentDays},
		{"GET", "/api/cameras/{id}/device-info", authCamera, s.handleDeviceInfo},
		{"POST", "/api/cameras/{id}/device-info/refresh", authAdmin, s.handleRefreshDeviceInfo},
		{"GET", "/api/cameras/{id}/motion", authCamera, s.handleMotionEvents},
		{"POST", "/api/cameras/{id}/webrtc", authCamera, s.handleWebRTC},
		{"GET", "/api/motion/live", authFull, s.handleAllMotionLive},
		{"GET", "/api/notifications/live", authFull, s.handleNotificationsLive},
		{"GET", "/api/cameras/{id}/motion/live", authCamera, s.handleMotionLive},
		{"GET", "/api/cameras/{id}/motion/scores", authCamera, s.handleMotionScores},
		{"GET", "/api/cameras/{id}/motion/region-score", authCamera, s.handleMotionRegionScore},
		{"GET", "/api/cameras/{id}/motion/daily-peak", authCamera, s.handleMotionDailyPeak},
		{"GET", "/api/cameras/{id}/motion/zones", authCamera, s.handleMotionZonesGet},
		{"PUT", "/api/cameras/{id}/motion/zones", authCamera, s.handleMotionZonesPut},
		{"GET", "/api/cameras/{id}/telegram-notify", authCamera, s.handleGetCameraTelegramNotify},
		{"PUT", "/api/cameras/{id}/telegram-notify", authCamera, s.handleSetCameraTelegramNotify},

		// State classification: config (admin) + leitura do estado corrente (cameraAccess).
		// Resolve um classificador só pelo próprio id, sem o id da câmera — usado pelo
		// deep-link de edição /settings/states/edit/:cid do frontend (história
		// refactor/camera-tabs-para-sidebar-ia), que não carrega o id da câmera na URL.
		{"GET", "/api/settings/classifiers/{cid}", authAdmin, s.handleClassifierGet},
		{"GET", "/api/settings/cameras/{id}/classifiers", authAdmin, s.handleStateClassifiersGet},
		{"POST", "/api/settings/cameras/{id}/classifiers", authAdmin, s.handleStateClassifierCreate},
		{"PUT", "/api/settings/cameras/{id}/classifiers/{cid}", authAdmin, s.handleStateClassifierUpdate},
		{"DELETE", "/api/settings/cameras/{id}/classifiers/{cid}", authAdmin, s.handleStateClassifierDelete},
		{"POST", "/api/settings/cameras/{id}/classifiers/{cid}/train", authAdmin, s.handleStateClassifierTrain},
		{"GET", "/api/settings/cameras/{id}/classifiers/{cid}/samples", authAdmin, s.handleStateClassifierSamplesGet},
		{"POST", "/api/settings/cameras/{id}/classifiers/{cid}/samples", authAdmin, s.handleStateClassifierSamplesSave},
		{"GET", "/api/cameras/{id}/classifiers/{cid}/state", authCamera, s.handleStateClassifierState},
		{"GET", "/api/cameras/{id}/classifiers/{cid}/history", authCamera, s.handleStateClassifierHistory},

		{"GET", "/api/events/{id}", authFull, s.handleGetEventByID},
		{"POST", "/api/events/{id}/annotations", authFull, s.handleCreateAnnotation},
		{"GET", "/api/events/{id}/annotations", authFull, s.handleListAnnotations},
		{"DELETE", "/api/events/{id}/annotations", authFull, s.handleDeleteAnnotationsByEvent},
		{"PATCH", "/api/annotations/{id}", authFull, s.handleUpdateAnnotation},
		{"DELETE", "/api/annotations/{id}", authFull, s.handleDeleteAnnotation},
		{"PATCH", "/api/events/{id}/label", authFull, s.handleUpdateEventLabel},
		{"PUT", "/api/events/{id}/frame", authFull, s.handleUpdateEventFrame},
		{"DELETE", "/api/events/bulk", authAdmin, s.handleBulkDeleteEvents},
		{"PATCH", "/api/events/bulk/dismiss", authAdmin, s.handleBulkDismissEvents},
		{"PATCH", "/api/events/bulk/label", authAdmin, s.handleBulkUpdateEventLabels},
		{"GET", "/api/cameras/{id}/events", authCamera, s.handlePageEvents},
		{"GET", "/api/settings/analysis/annotation-count", authAdmin, s.handleAnnotationCount},

		{"GET", "/api/cameras/{id}/snapshot", authCamera, s.handleSnapshot},
		{"GET", "/api/cameras/{id}/event-frame", authCamera, s.handleEventFrame},
		{"GET", "/api/cameras/{id}/stats", authCamera, s.handleCameraStats},
		{"GET", "/api/stats", authFull, s.handleStats},
	}
}
