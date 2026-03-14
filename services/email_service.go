package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// SendOTPEmail sends a branded HTML email with a 6-digit OTP code to the user.
func SendOTPEmail(toEmail, toName, code string) error {
	apiKey := os.Getenv("BREVO_API_KEY")
	senderEmail := os.Getenv("BREVO_SENDER_EMAIL")

	if apiKey == "" || senderEmail == "" {
		fmt.Println("⚠️  Brevo not configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing) — skipping email send")
		fmt.Printf("   [DEV] OTP for %s: %s\n", toEmail, code)
		return nil
	}

	url := "https://api.brevo.com/v3/smtp/email"
	subject := "Verify your Clovia account"
	htmlBody := buildOTPEmailHTML(toName, code)

	payload := map[string]interface{}{
		"sender": map[string]string{
			"name":  "Clovia",
			"email": senderEmail,
		},
		"to": []map[string]string{
			{
				"email": toEmail,
				"name":  toName,
			},
		},
		"subject":     subject,
		"htmlContent": htmlBody,
	}

	jsonPayload, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo send error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("brevo api error (status %d)", resp.StatusCode)
	}

	fmt.Printf("✅ Verification email sent to %s via Brevo\n", toEmail)
	return nil
}

// SendSchoolEmailOTP sends a 6-digit OTP to the user's school (.edu) email for verification.
func SendSchoolEmailOTP(toEmail, toName, code string) error {
	apiKey := os.Getenv("BREVO_API_KEY")
	senderEmail := os.Getenv("BREVO_SENDER_EMAIL")

	if apiKey == "" || senderEmail == "" {
		fmt.Println("⚠️  Brevo not configured — skipping school email send")
		fmt.Printf("   [DEV] School OTP for %s: %s\n", toEmail, code)
		return nil
	}

	url := "https://api.brevo.com/v3/smtp/email"
	subject := "Verify your school email - Clovia"
	htmlBody := buildSchoolEmailOTPHTML(toName, code)

	payload := map[string]interface{}{
		"sender": map[string]string{
			"name":  "Clovia",
			"email": senderEmail,
		},
		"to": []map[string]string{
			{
				"email": toEmail,
				"name":  toName,
			},
		},
		"subject":     subject,
		"htmlContent": htmlBody,
	}

	jsonPayload, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo send error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("brevo api error (status %d)", resp.StatusCode)
	}

	fmt.Printf("✅ School verification email sent to %s via Brevo\n", toEmail)
	return nil
}

// buildSchoolEmailOTPHTML returns HTML for the school email verification OTP.
func buildSchoolEmailOTPHTML(name, code string) string {
	displayCode := code
	if len(code) >= 6 {
		displayCode = code[:3] + " " + code[3:]
	}
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify your school email</title></head>
<body style="margin:0;padding:0;background-color:#FFFDF1;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background-color:#FFFDF1;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#6B9E78 0%%,#4a7c59 100%%);padding:32px 40px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Clovia</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Campus Marketplace</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi %s,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 32px;line-height:1.6;">
            Use the code below to verify that this school email belongs to you. This code expires in <strong>10 minutes</strong>.
          </p>
          <div style="background:#F0F7F2;border:2px dashed #6B9E78;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
            <p style="color:#6B9E78;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Your verification code</p>
            <p style="color:#1F2937;font-size:44px;font-weight:700;letter-spacing:8px;margin:0;font-family:'Courier New',monospace;">%s</p>
          </div>
          <p style="color:#6B7280;font-size:13px;margin:0;">If you didn't request this, you can ignore this email. Never share this code.</p>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;text-align:center;">
          <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Clovia — WMSU Campus Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, name, displayCode)
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
