/**
 * Vercel Serverless Function: POST /api/contact
 *
 * Accepts contact-form submissions and sends an email notification
 * via the SendGrid v3 Mail Send Web API using Node's built-in `fetch`.
 *
 * Environment variables:
 *   SENDGRID_API_KEY    - SendGrid API key (secret, never sent to clients)
 *   SENDGRID_FROM_EMAIL - Verified sender address used in the "From" field
 *   SENDGRID_TO_EMAIL   - Recipient address that should receive inquiries
 */
module.exports = async (req, res) => {
  // ------------------------------------------------------------------
  // 1. Only POST requests are accepted.
  // ------------------------------------------------------------------
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      message: 'This endpoint only accepts POST requests.'
    });
  }

  // ------------------------------------------------------------------
  // 2. Parse the JSON request body.
  // ------------------------------------------------------------------
  let data = req.body;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Request body must be valid JSON.'
      });
    }
  }

  // Normalise to an object (tolerate empty/missing bodies gracefully).
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    data = {};
  }

  // Extract the fields we care about, trimming whitespace where useful.
  const name = data.name?.trim();
  const email = data.email?.trim();
  const phone = data.phone?.trim();
  const service = data.service?.trim();
  const message = data.message?.trim();

  // ------------------------------------------------------------------
  // 3. Validate the required fields.
  //    These mirror the required attributes on the contact form:
  //    name, phone and service are mandatory; email & message are optional.
  // ------------------------------------------------------------------
  const missing = [];
  if (!name) missing.push('name');
  if (!phone) missing.push('phone');
  if (!service) missing.push('service');

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: `Missing required field(s): ${missing.join(', ')}.`
    });
  }

  // Validate the email format only when an email was actually provided.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasValidEmail = Boolean(email) && emailRegex.test(email);
  if (email && !hasValidEmail) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'A valid email address must be provided when email is supplied.'
    });
  }

  // ------------------------------------------------------------------
  // 4. Read configuration from environment variables.
  // ------------------------------------------------------------------
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const toEmail = process.env.SENDGRID_TO_EMAIL;

  if (!apiKey) {
    console.error('[contact] SENDGRID_API_KEY environment variable is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Server email configuration error: API key is missing.'
    });
  }

  if (!fromEmail || !toEmail) {
    console.error('[contact] SENDGRID_FROM_EMAIL or SENDGRID_TO_EMAIL is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Server email configuration error: sender or recipient is missing.'
    });
  }

  // ------------------------------------------------------------------
  // 5. Build the email content (plain text + HTML).
  //    All user-supplied values are escaped before being placed in HTML.
  // ------------------------------------------------------------------
  const escapeHtml = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '\x26amp;')
      .replace(/</g, '\x26lt;')
      .replace(/>/g, '\x26gt;')
      .replace(/"/g, '\x26quot;')
      .replace(/'/g, '\x26#39;');
  };

  const subject = 'New Website Inquiry - Infinite Building Solutions';

  const plainTextContent = [
    subject,
    '',
    `Name:    ${name || ''}`,
    `Email:   ${email || ''}`,
    `Phone:   ${phone || ''}`,
    `Service: ${service || ''}`,
    '',
    'Message:',
    `${message || ''}`
  ].join('\n');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:Poppins,Arial,sans-serif;background:#f7faff;color:#10233f;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f3;border-radius:16px;padding:32px;box-shadow:0 10px 30px rgba(15,76,151,.05);">
    <h1 style="margin:0 0 20px;font-size:22px;color:#0F4C97;border-bottom:1px solid #dbe7f3;padding-bottom:12px;">${escapeHtml(subject)}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.6;">
      <tr>
        <td style="padding:6px 0;font-weight:600;">Name:</td>
        <td style="padding:6px 0;">${escapeHtml(name)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-weight:600;">Email:</td>
        <td style="padding:6px 0;">${escapeHtml(email)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-weight:600;">Phone:</td>
        <td style="padding:6px 0;">${escapeHtml(phone)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-weight:600;">Service:</td>
        <td style="padding:6px 0;">${escapeHtml(service)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:6px 0;font-weight:600;">Message:</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:6px 0;">${escapeHtml(message) || '<em>(no message provided)</em>'}</td>
      </tr>
    </table>
    <p style="margin-top:24px;font-size:12px;color:#667891;">This email was sent automatically from the IBS website contact form.</p>
  </div>
</body>
</html>
`;

  // ------------------------------------------------------------------
  // 6. Assemble the SendGrid v3 Mail Send payload.
  // ------------------------------------------------------------------
  const payload = {
    personalizations: [
      {
        to: [{ email: toEmail }],
        subject: subject
      }
    ],
    from: { email: fromEmail },
    content: [
      { type: 'text/plain', value: plainTextContent },
      { type: 'text/html', value: htmlContent }
    ]
  };

  // Set reply_to ONLY when a valid customer email was provided.
  if (hasValidEmail) {
    payload.reply_to = { email: email };
  }

  // ------------------------------------------------------------------
  // 7. Send the request to the SendGrid Web API.
  // ------------------------------------------------------------------
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[contact] SendGrid API error (${response.status}): ${errorText}`);
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to send email through the provider. Please try again later.'
      });
    }

    // Successful SendGrid response (202 Accepted).
    return res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully.'
    });
  } catch (err) {
    console.error('[contact] Error calling SendGrid API:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while sending your message.'
    });
  }
};
