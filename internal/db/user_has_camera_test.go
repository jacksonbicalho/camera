package db_test

import (
	"testing"

	"camera/internal/db"
)

// UserHasCamera answers the access-control boolean with a single indexed
// lookup instead of fetching every camera a user can see and scanning.
func TestUserHasCamera(t *testing.T) {
	database := openTestDB(t)

	uid, err := db.CreateUser(database, "viewer", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := db.SetUserCameras(database, uid, []string{"cam1"}); err != nil {
		t.Fatalf("SetUserCameras: %v", err)
	}

	ok, err := db.UserHasCamera(database, uid, "cam1")
	if err != nil {
		t.Fatalf("UserHasCamera(cam1): %v", err)
	}
	if !ok {
		t.Error("expected access to granted cam1, got false")
	}

	ok, err = db.UserHasCamera(database, uid, "cam2")
	if err != nil {
		t.Fatalf("UserHasCamera(cam2): %v", err)
	}
	if ok {
		t.Error("expected no access to ungranted cam2, got true")
	}

	// Unknown user has no grants.
	ok, err = db.UserHasCamera(database, 99999, "cam1")
	if err != nil {
		t.Fatalf("UserHasCamera(unknown): %v", err)
	}
	if ok {
		t.Error("expected no access for unknown user, got true")
	}
}
