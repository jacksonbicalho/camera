package email_test

import (
	"net/smtp"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/email"
)

func TestSMTPSender_Send_CallsSendMailWithExpectedArgs(t *testing.T) {
	var gotAddr, gotFrom string
	var gotTo []string
	var gotMsg []byte

	restore := email.StubSendMail(func(addr string, _ smtp.Auth, from string, to []string, msg []byte) error {
		gotAddr, gotFrom, gotTo, gotMsg = addr, from, to, msg
		return nil
	})
	defer restore()

	s := email.NewSMTPSender(config.SMTPConfig{
		Host:     "smtp.example.com",
		Port:     587,
		Username: "no-reply@example.com",
		Password: "secret",
	})

	if err := s.Send("dest@example.com", "Assunto", "Corpo da mensagem"); err != nil {
		t.Fatalf("Send: %v", err)
	}

	if gotAddr != "smtp.example.com:587" {
		t.Errorf("expected addr smtp.example.com:587, got %q", gotAddr)
	}
	if gotFrom != "no-reply@example.com" {
		t.Errorf("expected from no-reply@example.com, got %q", gotFrom)
	}
	if len(gotTo) != 1 || gotTo[0] != "dest@example.com" {
		t.Errorf("expected to=[dest@example.com], got %v", gotTo)
	}
	msg := string(gotMsg)
	if !strings.Contains(msg, "Subject: Assunto") {
		t.Errorf("expected message to contain the subject header, got: %s", msg)
	}
	if !strings.Contains(msg, "Corpo da mensagem") {
		t.Errorf("expected message to contain the body, got: %s", msg)
	}
}

func TestSMTPSender_Send_PropagatesError(t *testing.T) {
	restore := email.StubSendMail(func(string, smtp.Auth, string, []string, []byte) error {
		return errBoom
	})
	defer restore()

	s := email.NewSMTPSender(config.SMTPConfig{Host: "smtp.example.com", Port: 587})
	if err := s.Send("dest@example.com", "Assunto", "Corpo"); err == nil {
		t.Error("expected error to propagate")
	}
}

var errBoom = &testError{"boom"}

type testError struct{ msg string }

func (e *testError) Error() string { return e.msg }
