package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Duration time.Duration

func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	parsed, err := time.ParseDuration(value.Value)
	if err != nil {
		return fmt.Errorf("invalid duration %q: %w", value.Value, err)
	}
	*d = Duration(parsed)
	return nil
}

const DefaultChunkDuration = 5 * time.Minute
const DefaultReconnectInterval = 2 * time.Second

// Config holds the minimal bootstrap configuration read from the YAML file.
// All camera settings, motion config and user data live in the SQLite database.
type Config struct {
	Debug      bool             `yaml:"debug"`
	Timezone   string           `yaml:"timezone"`
	DBPath     string           `yaml:"db_path"`
	Log        LogConfig        `yaml:"log"`
	Server     ServerConfig     `yaml:"server"`
	Storage    StorageConfig    `yaml:"storage"`
	Admin      AdminConfig      `yaml:"admin"`
	SMTP       SMTPConfig       `yaml:"smtp"`
	Extensions ExtensionsConfig `yaml:"extensions"`
}

// ExtensionsConfig holds settings for optional integrations ("extensions").
// Each extension gets its own nested config; presence of its required field
// (e.g. Telegram.BotToken) is what "available" means — same idiom as
// SMTPConfig.Host for e-mail.
type ExtensionsConfig struct {
	Telegram TelegramConfig `yaml:"telegram"`
}

// TelegramConfig holds the Telegram Bot API token used by
// internal/extensions/telegram.
type TelegramConfig struct {
	BotToken string `yaml:"bot_token"`
}

// SMTPConfig holds outbound e-mail server settings (connection config only;
// the client that sends the mail lives in internal/email, e.g. SMTPSender).
type SMTPConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	// FromName/FromEmail controlam o cabeçalho From: e o envelope MAIL FROM
	// dos e-mails enviados. Vazios por padrão — internal/email.SMTPSender
	// resolve os defaults ("os-camera" / Username) em tempo de envio.
	FromName  string `yaml:"from_name"`
	FromEmail string `yaml:"from_email"`
}

type LogConfig struct {
	Output     string `yaml:"output"`
	Path       string `yaml:"path"`
	MaxSizeMB  *int   `yaml:"max_size_mb"`
	MaxAgeDays *int   `yaml:"max_age_days"`
	MaxBackups *int   `yaml:"max_backups"`
	Compress   *bool  `yaml:"compress"`
}

// Defaults for log rotation, applied when the field is absent from the YAML.
// Pointers distinguish "absent" from an explicit zero (0 = unlimited in lumberjack).
const (
	DefaultLogMaxSizeMB  = 50
	DefaultLogMaxAgeDays = 30
	DefaultLogMaxBackups = 10
	DefaultLogCompress   = true
)

func (c LogConfig) MaxSizeMBOrDefault() int {
	if c.MaxSizeMB != nil {
		return *c.MaxSizeMB
	}
	return DefaultLogMaxSizeMB
}

func (c LogConfig) MaxAgeDaysOrDefault() int {
	if c.MaxAgeDays != nil {
		return *c.MaxAgeDays
	}
	return DefaultLogMaxAgeDays
}

func (c LogConfig) MaxBackupsOrDefault() int {
	if c.MaxBackups != nil {
		return *c.MaxBackups
	}
	return DefaultLogMaxBackups
}

func (c LogConfig) CompressOrDefault() bool {
	if c.Compress != nil {
		return *c.Compress
	}
	return DefaultLogCompress
}

type AdminConfig struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type ServerConfig struct {
	Port           int    `yaml:"port"`
	SegmentsPath   string `yaml:"segments_path"`
	RecordingsPath string `yaml:"recordings_path"`
	JWTSecret      string `yaml:"jwt_secret"`
}

type StorageConfig struct {
	Path string `yaml:"path"`
}

// MotionConfig holds per-camera motion detection settings (used by the DB layer).
type MotionConfig struct {
	Enabled              bool    `yaml:"enabled"`
	Threshold            float64 `yaml:"threshold"`
	FPS                  int     `yaml:"fps"`
	CooldownSeconds      int     `yaml:"cooldown_seconds"`
	CaptureWidth         int     `yaml:"capture_width"`
	CaptureHeight        int     `yaml:"capture_height"`
	PlaybackLeadSeconds  int     `yaml:"playback_lead_seconds"`
	PlaybackTrailSeconds int     `yaml:"playback_trail_seconds"`
}

// CameraConfig holds per-camera settings loaded from the database.
type CameraConfig struct {
	ID                string        `yaml:"id"`
	Name              string        `yaml:"name"`
	RTSPURL           string        `yaml:"rtsp_url"`
	MotionRTSPURL     string        `yaml:"motion_rtsp_url"`
	CaptureType       string        `yaml:"capture_type"`
	ChunkDuration     Duration      `yaml:"chunk_duration"`
	ReconnectInterval Duration      `yaml:"reconnect_interval"`
	VideoCodec        string        `yaml:"video_codec"`
	HasAudio          *bool         `yaml:"has_audio"`
	Width             int           `yaml:"width"`
	Height            int           `yaml:"height"`
	DisplayOrder      int           `yaml:"display_order"`
	HLSVideoMode      string        `yaml:"hls_video_mode"`
	RecordVideoMode   string        `yaml:"record_video_mode"`
	LiveTransport     string        `yaml:"live_transport"`
	HLSSegmentSeconds *int          `yaml:"hls_segment_seconds"`
	HLSListSize       *int          `yaml:"hls_list_size"`
	HLSDVRSeconds     *int          `yaml:"hls_dvr_seconds"`
	Motion            *MotionConfig `yaml:"motion"`
	RecordingEnabled  bool          `yaml:"recording_enabled"`
	LiveEnabled       bool          `yaml:"live_enabled"`
}

func (c CameraConfig) HLSSegmentSecondsOrDefault() int {
	if c.HLSSegmentSeconds != nil {
		return *c.HLSSegmentSeconds
	}
	return 2
}

func (c CameraConfig) HLSListSizeOrDefault() int {
	if c.HLSListSize != nil {
		return *c.HLSListSize
	}
	return 5
}

func (c CameraConfig) HLSDVRSecondsOrDefault() int {
	if c.HLSDVRSeconds != nil {
		return *c.HLSDVRSeconds
	}
	return 0
}

func (c CameraConfig) EffectiveMotionConfig() MotionConfig {
	if c.Motion != nil {
		return *c.Motion
	}
	return MotionConfig{}
}

// EffectiveMotionURL returns the RTSP URL the motion detector should read: the
// per-camera MotionRTSPURL when set (e.g. a lighter substream, to cut decode
// cost), otherwise the main RTSPURL.
func (c CameraConfig) EffectiveMotionURL() string {
	if c.MotionRTSPURL != "" {
		return c.MotionRTSPURL
	}
	return c.RTSPURL
}

// EffectiveLiveTransport returns the per-camera live transport preference,
// defaulting to "auto" (try WebRTC, fall back to HLS) when unset.
func (c CameraConfig) EffectiveLiveTransport() string {
	if c.LiveTransport == "" {
		return "auto"
	}
	return c.LiveTransport
}

// EffectiveCaptureType returns the per-camera capture protocol, defaulting to
// "rtsp" (the only protocol supported before capture_type existed) when unset.
func (c CameraConfig) EffectiveCaptureType() string {
	if c.CaptureType == "" {
		return "rtsp"
	}
	return c.CaptureType
}

func (c CameraConfig) EffectiveChunkDuration() time.Duration {
	if c.ChunkDuration != 0 {
		return time.Duration(c.ChunkDuration)
	}
	return DefaultChunkDuration
}

func (c CameraConfig) EffectiveReconnectInterval() time.Duration {
	if c.ReconnectInterval != 0 {
		return time.Duration(c.ReconnectInterval)
	}
	return DefaultReconnectInterval
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	if v := os.Getenv("OS_CAMERA_TIMEZONE"); v != "" {
		cfg.Timezone = v
	}
	if v := os.Getenv("OS_CAMERA_JWT_SECRET"); v != "" {
		cfg.Server.JWTSecret = v
	}
	if v := os.Getenv("OS_CAMERA_DEBUG"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			cfg.Debug = b
		}
	}
	if v := os.Getenv("OS_CAMERA_SMTP_HOST"); v != "" {
		cfg.SMTP.Host = v
	}
	if v := os.Getenv("OS_CAMERA_SMTP_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.SMTP.Port = p
		}
	}
	if v := os.Getenv("OS_CAMERA_SMTP_USERNAME"); v != "" {
		cfg.SMTP.Username = v
	}
	if v := os.Getenv("OS_CAMERA_SMTP_PASSWORD"); v != "" {
		cfg.SMTP.Password = v
	}
	if v := os.Getenv("OS_CAMERA_SMTP_FROM_NAME"); v != "" {
		cfg.SMTP.FromName = v
	}
	if v := os.Getenv("OS_CAMERA_SMTP_FROM_EMAIL"); v != "" {
		cfg.SMTP.FromEmail = v
	}
	if v := os.Getenv("OS_CAMERA_STORAGE_PATH"); v != "" {
		cfg.Storage.Path = v
	}
	if v := os.Getenv("OS_CAMERA_EXT_TELEGRAM_BOT_TOKEN"); v != "" {
		cfg.Extensions.Telegram.BotToken = v
	}
	if cfg.Timezone == "" {
		cfg.Timezone = "UTC"
	}
	return cfg, nil
}
