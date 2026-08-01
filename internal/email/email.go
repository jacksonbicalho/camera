// Package email sends outbound e-mail (password reset today; generic enough
// for future uses). No dependency added — net/smtp (stdlib) is enough.
package email

import (
	"fmt"
	"net/smtp"

	"camera/internal/config"
)

// Sender sends a plain-text e-mail. Defined here (single small interface,
// the -er suffix) since the SMTP implementation lives in this same package;
// internal/server depends only on this interface via WithEmailSender.
type Sender interface {
	Send(to, subject, body string) error
}

// SMTPSender sends e-mail through an SMTP server configured via
// config.SMTPConfig.
type SMTPSender struct {
	cfg config.SMTPConfig
}

// NewSMTPSender returns a Sender backed by the given SMTP configuration.
func NewSMTPSender(cfg config.SMTPConfig) *SMTPSender {
	return &SMTPSender{cfg: cfg}
}

// sendMail is a seam over smtp.SendMail so tests can substitute a fake
// without a real SMTP server.
var sendMail = smtp.SendMail

// StubSendMail replaces the SMTP seam for tests and returns a function that
// restores the real smtp.SendMail. Exported for internal/email's own tests.
func StubSendMail(fn func(addr string, a smtp.Auth, from string, to []string, msg []byte) error) (restore func()) {
	original := sendMail
	sendMail = fn
	return func() { sendMail = original }
}

// defaultFromName is used when SMTPConfig.FromName is not set — every
// outbound e-mail identifies the app in the sender's display name, even
// with zero SMTP-specific configuration beyond host/username/password.
const defaultFromName = "os-camera"

func (s *SMTPSender) Send(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	var auth smtp.Auth
	if s.cfg.Username != "" {
		auth = smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	}
	fromName := s.cfg.FromName
	if fromName == "" {
		fromName = defaultFromName
	}
	fromEmail := s.cfg.FromEmail
	if fromEmail == "" {
		fromEmail = s.cfg.Username
	}
	msg := fmt.Appendf(nil, "From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n",
		fromName, fromEmail, to, subject, body)
	return sendMail(addr, auth, fromEmail, []string{to}, msg)
}
