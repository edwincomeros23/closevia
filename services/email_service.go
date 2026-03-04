package services

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/mailgun/mailgun-go/v5"
)

// SendOTPEmail sends a branded HTML email with a 6-digit OTP code to the user.
func SendOTPEmail(toEmail, toName, code string) error {
	domain := os.Getenv("MAILGUN_DOMAIN")
	apiKey := os.Getenv("MAILGUN_API_KEY")

	if domain == "" || apiKey == "" {
		fmt.Println("⚠️  Mailgun not configured (MAILGUN_DOMAIN or MAILGUN_API_KEY missing) — skipping email send")
		fmt.Printf("   [DEV] OTP for %s: %s\n", toEmail, code)
		return nil
	}

	// v5 API: NewMailgun takes only the API key
	mg := mailgun.NewMailgun(apiKey)

	subject := "Verify your Clovia account"
	htmlBody := buildOTPEmailHTML(toName, code)
	sender := fmt.Sprintf("Clovia <noreply@%s>", domain)

	// v5 API: NewMessage is a package-level function, not a method
	message := mailgun.NewMessage(domain, sender, subject, "", toEmail)
	message.SetHTML(htmlBody)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// v5 API: Send returns (resp, err) — 2 values only
	_, err := mg.Send(ctx, message)
	if err != nil {
		return fmt.Errorf("mailgun send error: %w", err)
	}

	fmt.Printf("✅ Verification email sent to %s\n", toEmail)
	return nil
}

// buildOTPEmailHTML returns a styled HTML email body with the OTP code.
func buildOTPEmailHTML(name, code string) string {
	// Format code with a space in the middle for readability: "482 931"
	displayCode := code[:3] + " " + code[3:]
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Clovia account</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFDF1;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background-color:#FFFDF1;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6B9E78 0%%,#4a7c59 100%%);padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Clovia</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Campus Marketplace</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi %s,</p>
              <p style="color:#374151;font-size:15px;margin:0 0 32px;line-height:1.6;">
                Welcome to Clovia! To complete your registration, please verify your email address using the code below.
                This code expires in <strong>10 minutes</strong>.
              </p>
              <!-- OTP Box -->
              <div style="background:#F0F7F2;border:2px dashed #6B9E78;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
                <p style="color:#6B9E78;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Your verification code</p>
                <p style="color:#1F2937;font-size:44px;font-weight:700;letter-spacing:8px;margin:0;font-family:'Courier New',monospace;">%s</p>
              </div>
              <p style="color:#6B7280;font-size:13px;margin:0;line-height:1.6;">
                If you didn't create a Clovia account, you can safely ignore this email.
                Never share this code with anyone.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Clovia — WMSU Campus Marketplace</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, name, displayCode)
}
