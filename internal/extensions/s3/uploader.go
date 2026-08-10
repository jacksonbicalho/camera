// Package s3 implements the "s3" retention extension: a fire-and-forget
// upload client to an S3-compatible bucket, used by internal/storage.Cleaner
// to archive recordings before deleting them locally.
package s3

import (
	"context"
	"io"
)

// Uploader is a one-way archive destination. Uploads are fire-and-forget
// archives; there is no download path back into the system.
type Uploader interface {
	Upload(ctx context.Context, key string, r io.Reader, size int64) error
}
