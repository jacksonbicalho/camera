package core_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"camera/internal/core"
)

type fakeSnapshotExecutor struct {
	name string
	args []string
	out  []byte
	err  error
}

func (f *fakeSnapshotExecutor) Execute(_ context.Context, name string, args ...string) ([]byte, error) {
	f.name = name
	f.args = args
	return f.out, f.err
}

func TestSnapshot(t *testing.T) {
	t.Run("CA4: monta os mesmos argumentos ffmpeg que takeSnapshot produzia (1 frame JPEG via RTSP)", func(t *testing.T) {
		fake := &fakeSnapshotExecutor{out: []byte("jpeg-bytes")}
		data, err := core.Snapshot(context.Background(), "rtsp://cam/stream", "rtsp", fake)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if string(data) != "jpeg-bytes" {
			t.Errorf("esperava os bytes devolvidos pelo executor, got %q", data)
		}
		if fake.name != "ffmpeg" {
			t.Errorf("esperava comando ffmpeg, got %q", fake.name)
		}
		want := []string{
			"-rtsp_transport", "tcp", "-i", "rtsp://cam/stream",
			"-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-",
		}
		if !reflect.DeepEqual(fake.args, want) {
			t.Errorf("args = %v, want %v", fake.args, want)
		}
	})

	t.Run("CA4: propaga erro do executor", func(t *testing.T) {
		fake := &fakeSnapshotExecutor{err: errors.New("boom")}
		if _, err := core.Snapshot(context.Background(), "rtsp://cam/stream", "rtsp", fake); err == nil {
			t.Error("esperava erro propagado")
		}
	})

	t.Run("CA6: capture_type=hls não emite -rtsp_transport tcp", func(t *testing.T) {
		fake := &fakeSnapshotExecutor{out: []byte("jpeg-bytes")}
		_, err := core.Snapshot(context.Background(), "https://cam.example.com/stream/playlist.m3u8", "hls", fake)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{
			"-i", "https://cam.example.com/stream/playlist.m3u8",
			"-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-",
		}
		if !reflect.DeepEqual(fake.args, want) {
			t.Errorf("args = %v, want %v", fake.args, want)
		}
	})
}
