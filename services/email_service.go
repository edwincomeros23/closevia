package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"os"
	"time"
)

// sendViaGmailSMTP sends an HTML email using Gmail SMTP as fallback when Brevo isn't configured.
// Requires SMTP_EMAIL and SMTP_PASSWORD (Gmail App Password) in .env
func sendViaGmailSMTP(toEmail, subject, htmlBody string) error {
	smtpEmail := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")

	if smtpEmail == "" || smtpPassword == "" {
		return fmt.Errorf("SMTP not configured (SMTP_EMAIL or SMTP_PASSWORD missing)")
	}

	from := smtpEmail
	to := toEmail
	host := "smtp.gmail.com"
	port := "587"

	headers := fmt.Sprintf("From: Clovia <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n", from, to, subject)
	msg := []byte(headers + htmlBody)

	auth := smtp.PlainAuth("", from, smtpPassword, host)
	err := smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
	if err != nil {
		return fmt.Errorf("gmail SMTP error: %w", err)
	}

	fmt.Printf("✅ Email sent to %s via Gmail SMTP\n", toEmail)
	return nil
}

// SendOTPEmail sends a branded HTML email with a 6-digit OTP code to the user.
func SendOTPEmail(toEmail, toName, code string) error {
	return sendOTP(toEmail, toName, code, "Verify your Clovia account", buildOTPEmailHTML)
}

// SendPasswordResetOTP sends a 6-digit OTP for password reset.
func SendPasswordResetOTP(toEmail, toName, code string) error {
	return sendOTP(toEmail, toName, code, "Reset your Clovia password", buildPasswordResetOTPHTML)
}

// Internal generic sender to reduce duplication
func sendOTP(toEmail, toName, code, subject string, htmlBuilder func(string, string) string) error {
	apiKey := os.Getenv("BREVO_API_KEY")
	senderEmail := os.Getenv("BREVO_SENDER_EMAIL")

	if apiKey == "" || senderEmail == "" {
		fmt.Printf("⚠️  Brevo not configured — skipping email send (%s)\n", subject)
		fmt.Printf("   [DEV] OTP for %s: %s\n", toEmail, code)
		return nil
	}

	url := "https://api.brevo.com/v3/smtp/email"
	htmlBody := htmlBuilder(toName, code)

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
		var errResp map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("brevo api error (status %d): %v", resp.StatusCode, errResp)
	}

	fmt.Printf("✅ %s email sent to %s via Brevo\n", subject, toEmail)
	return nil
}

// SendSchoolEmailOTP sends a 6-digit OTP to the user's school (.edu) email for verification.
func SendSchoolEmailOTP(toEmail, toName, code string) error {
	return sendOTP(toEmail, toName, code, "Verify your school email - Clovia", buildSchoolEmailOTPHTML)
}

// SendPasswordResetEmail sends a 6-digit OTP for password reset.
func SendPasswordResetEmail(toEmail, toName, code string) error {
	apiKey := os.Getenv("BREVO_API_KEY")
	senderEmail := os.Getenv("BREVO_SENDER_EMAIL")

	subject := "Reset your Clovia password"
	htmlBody := buildPasswordResetEmailHTML(toName, code)

	// Try Brevo first
	if apiKey != "" && senderEmail != "" {
		url := "https://api.brevo.com/v3/smtp/email"

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
		if err == nil {
			req.Header.Set("api-key", apiKey)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json")

			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode < 300 {
					fmt.Printf("✅ Password reset email sent to %s via Brevo\n", toEmail)
					return nil
				}
				fmt.Printf("⚠️  Brevo failed (status %d), falling back to Gmail SMTP\n", resp.StatusCode)
			} else {
				fmt.Printf("⚠️  Brevo request error: %v, falling back to Gmail SMTP\n", err)
			}
		}
	}

	// Fallback to Gmail SMTP
	if err := sendViaGmailSMTP(toEmail, subject, htmlBody); err == nil {
		return nil
	}

	// Last resort: print to console
	fmt.Println("⚠️  No email service configured — printing OTP to console")
	fmt.Printf("   [DEV] Password reset OTP for %s: %s\n", toEmail, code)
	return nil
}

// buildPasswordResetEmailHTML returns HTML for the password reset OTP email.
func buildPasswordResetEmailHTML(name, code string) string {
	displayCode := code
	if len(code) >= 6 {
		displayCode = code[:3] + " " + code[3:]
	}
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reset your password</title></head>
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
            We received a request to reset your password. Use the code below to proceed.
            This code expires in <strong>15 minutes</strong>.
          </p>
          <div style="background:#FFF5F5;border:2px dashed #E53E3E;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
            <p style="color:#E53E3E;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Password reset code</p>
            <p style="color:#1F2937;font-size:44px;font-weight:700;letter-spacing:8px;margin:0;font-family:'Courier New',monospace;">%s</p>
          </div>
          <p style="color:#6B7280;font-size:13px;margin:0;">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
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

// buildPasswordResetOTPHTML returns a styled HTML email body for password reset.
func buildPasswordResetOTPHTML(name, code string) string {
	displayCode := code[:3] + " " + code[3:]
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reset your Clovia password</title></head>
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
            We received a request to reset your Clovia account password. Use the code below to proceed.
            This code expires in <strong>10 minutes</strong>.
          </p>
          <div style="background:#F0F7F2;border:2px dashed #6B9E78;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
            <p style="color:#6B9E78;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Your reset code</p>
            <p style="color:#1F2937;font-size:44px;font-weight:700;letter-spacing:8px;margin:0;font-family:'Courier New',monospace;">%s</p>
          </div>
          <p style="color:#6B7280;font-size:13px;margin:0;">If you didn't request a password reset, you can safely ignore this email.</p>
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

// SendEscalationAssignedEmail notifies admin that an escalation has been assigned
func SendEscalationAssignedEmail(adminEmail, adminName string, escalationID int, caseDetails string) error {
	subject := fmt.Sprintf("New Escalation Case #%d Assigned to You", escalationID)
	htmlBody := fmt.Sprintf(`
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#F3F4F6;">
  <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="background:#F3F4F6;">
    <tr><td style="padding:0;">
      <table width="600" border="0" cellspacing="0" cellpadding="0" style="margin:30px auto;background:#FFFFFF;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg, #667eea 0%%, #764ba2 100%%);padding:30px 40px;border-radius:12px 12px 0 0;">
          <p style="color:#FFFFFF;font-size:20px;font-weight:700;margin:0;">New Escalation Assigned</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#374151;font-size:16px;margin:0 0 20px;"><strong>Hi %s,</strong></p>
          <p style="color:#374151;font-size:15px;margin:0 0 20px;line-height:1.6;">
            A new dispute escalation has been assigned to you for review and resolution.
          </p>
          <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px;margin:20px 0;border-radius:4px;">
            <p style="color:#78350F;font-size:14px;margin:0;"><strong>Escalation ID:</strong> #%d</p>
            <p style="color:#78350F;font-size:14px;margin:8px 0 0;">%s</p>
          </div>
          <p style="color:#6B7280;font-size:13px;margin:20px 0;"><strong>Next Steps:</strong></p>
          <ul style="color:#6B7280;font-size:13px;margin:0;padding-left:20px;">
            <li>Review all evidence and chat transcripts</li>
            <li>Interview affected parties if needed</li>
            <li>Make a resolution decision within the SLA window</li>
          </ul>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;text-align:center;">
          <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Clovia Admin System</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, adminName, escalationID, caseDetails)

	return sendViaGmailSMTP(adminEmail, subject, htmlBody)
}

// SendEscalationResolvedEmail notifies both parties of the resolution
func SendEscalationResolvedEmail(partyEmail, partyName, outcomeType string, notes string) error {
	subject := "Escalation Case Resolution - Clovia"

	outcomeDisplay := map[string]string{
		"proceed":              "Case Dismissed",
		"cancel_return_strike": "Trade Cancelled - Strike Issued",
		"suspend_pending":      "Account Suspended - Pending Review",
		"partial_refund":       "Partial Refund Processed",
		"warning_only":         "Warning Issued",
		"conditional_strike":   "Conditional Strike Recorded",
		"split_resolution":     "Shared Responsibility - Both Warned",
	}

	display := outcomeDisplay[outcomeType]
	if display == "" {
		display = outcomeType
	}

	htmlBody := fmt.Sprintf(`
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#F3F4F6;">
  <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="background:#F3F4F6;">
    <tr><td style="padding:0;">
      <table width="600" border="0" cellspacing="0" cellpadding="0" style="margin:30px auto;background:#FFFFFF;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg, #667eea 0%%, #764ba2 100%%);padding:30px 40px;border-radius:12px 12px 0 0;">
          <p style="color:#FFFFFF;font-size:20px;font-weight:700;margin:0;">Escalation Case Resolved</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#374151;font-size:16px;margin:0 0 20px;"><strong>Hi %s,</strong></p>
          <p style="color:#374151;font-size:15px;margin:0 0 20px;line-height:1.6;">
            Your dispute escalation case has been reviewed by our admin team and a final decision has been made.
          </p>
          <div style="background:#DDD6FE;border-left:4px solid #6366F1;padding:16px;margin:20px 0;border-radius:4px;">
            <p style="color:#312E81;font-size:14px;margin:0;"><strong>Resolution:</strong> %s</p>
          </div>
          <p style="color:#374151;font-size:14px;margin:16px 0;">
            <strong>Notes from Admin:</strong><br>
            <span style="color:#6B7280;">%s</span>
          </p>
          <p style="color:#6B7280;font-size:13px;margin:20px 0;">
            If you have any questions about this decision, please contact our support team.
          </p>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;text-align:center;">
          <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Clovia — WMSU Campus Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, partyName, display, notes)

	return sendViaGmailSMTP(partyEmail, subject, htmlBody)
}
