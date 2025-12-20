import { Resend } from 'resend';

// Lazy initialization to avoid build-time errors when API key is not set
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = 'Neram Classes <notifications@neramclasses.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@neramclasses.com';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface TemplateData {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html: data.html,
      reply_to: data.replyTo,
    });

    if (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Email service error:', err);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * Send email using a template
 */
export async function sendTemplateEmail(
  to: string,
  templateName: string,
  data: TemplateData
): Promise<{ success: boolean; error?: string }> {
  const template = getEmailTemplate(templateName, data);

  if (!template) {
    return { success: false, error: `Template "${templateName}" not found` };
  }

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  });
}

/**
 * Email templates
 */
function getEmailTemplate(name: string, data: TemplateData): { subject: string; html: string } | null {
  const templates: Record<string, { subject: string; html: string }> = {
    'application-submitted': {
      subject: 'Application Received - Neram Classes',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .steps { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .step { display: flex; align-items: center; margin: 15px 0; }
            .step-number { background: #1565C0; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Application Received!</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Thank you for applying to Neram Classes! We have received your application for <strong>${data.course}</strong>.</p>

              <div class="steps">
                <h3 style="margin-top: 0;">What happens next?</h3>
                <div class="step">
                  <div class="step-number">1</div>
                  <div>Our counselor will review your application within 24-48 hours</div>
                </div>
                <div class="step">
                  <div class="step-number">2</div>
                  <div>You'll receive a call to discuss course details and fees</div>
                </div>
                <div class="step">
                  <div class="step-number">3</div>
                  <div>Complete payment to confirm your seat</div>
                </div>
              </div>

              ${data.scholarshipApplied ? `
              <p style="background: #E8F5E9; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50;">
                <strong>Scholarship Applied!</strong><br>
                You've applied for our scholarship program. We'll verify your documents and update you soon.
              </p>
              ` : ''}

              <p>If you have any questions, feel free to reply to this email or call us at <strong>+91 98765 43210</strong>.</p>

              <a href="https://app.neramclasses.com/dashboard" class="button">View Application Status</a>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | www.neramclasses.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'application-approved': {
      subject: 'Application Approved - Complete Your Payment',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2E7D32, #1B5E20); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #2E7D32; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .fee-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .fee-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .fee-total { font-size: 1.3em; font-weight: bold; color: #1565C0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Congratulations!</h1>
              <p style="margin: 10px 0 0;">Your application has been approved</p>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Great news! Your application for <strong>${data.course}</strong> has been approved.</p>

              <div class="fee-box">
                <h3 style="margin-top: 0;">Fee Details</h3>
                <div class="fee-row">
                  <span>Course Fee:</span>
                  <span>Rs. ${data.baseFee}</span>
                </div>
                ${Number(data.scholarshipDiscount) > 0 ? `
                <div class="fee-row" style="color: #2E7D32;">
                  <span>Scholarship Discount (${data.scholarshipPercentage}%):</span>
                  <span>- Rs. ${data.scholarshipDiscount}</span>
                </div>
                ` : ''}
                <div class="fee-row fee-total" style="border: none; padding-top: 15px;">
                  <span>Amount to Pay:</span>
                  <span>Rs. ${data.finalFee}</span>
                </div>
              </div>

              ${data.couponCode ? `
              <p style="background: #FFF3E0; padding: 15px; border-radius: 8px; border-left: 4px solid #FF9800;">
                <strong>Your Coupon Code:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 1.1em;">${data.couponCode}</code><br>
                Use this code during payment for additional discount!
              </p>
              ` : ''}

              <p><strong>Payment Deadline:</strong> ${data.paymentDeadline}</p>

              <a href="https://app.neramclasses.com/payment/${data.leadId}" class="button">Pay Now & Confirm Seat</a>

              <p style="color: #666; font-size: 0.9em;">
                Tip: Pay via UPI/Bank Transfer to earn Rs. 100 extra cashback!
              </p>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | www.neramclasses.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'payment-confirmation': {
      subject: 'Payment Confirmed - Welcome to Neram Classes!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .receipt { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Welcome to Neram Classes!</h1>
              <p style="margin: 10px 0 0;">Your enrollment is confirmed</p>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Congratulations! Your payment has been received and your enrollment is now confirmed.</p>

              <div class="receipt">
                <h3 style="margin-top: 0;">Payment Receipt</h3>
                <p><strong>Course:</strong> ${data.course}</p>
                <p><strong>Amount Paid:</strong> Rs. ${data.amount}</p>
                <p><strong>Payment ID:</strong> ${data.paymentId}</p>
                <p><strong>Date:</strong> ${data.date}</p>
              </div>

              ${Number(data.cashback) > 0 ? `
              <p style="background: #E8F5E9; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50;">
                <strong>Cashback Earned: Rs. ${data.cashback}</strong><br>
                This will be transferred to your registered mobile number within 7 days.
              </p>
              ` : ''}

              <h3>What's Next?</h3>
              <ul>
                <li>You'll receive batch allocation details within 2 days</li>
                <li>Download study materials from your dashboard</li>
                <li>Join our WhatsApp group for updates</li>
              </ul>

              <a href="https://app.neramclasses.com/dashboard" class="button">Go to Dashboard</a>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | www.neramclasses.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'payment-reminder': {
      subject: 'Payment Reminder - Complete Your Enrollment',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #F57C00, #E65100); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #F57C00; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Payment Reminder</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>This is a friendly reminder that your payment for <strong>${data.course}</strong> is pending.</p>

              <p style="background: #FFF3E0; padding: 15px; border-radius: 8px; border-left: 4px solid #FF9800;">
                <strong>Amount Due:</strong> Rs. ${data.amount}<br>
                <strong>Deadline:</strong> ${data.deadline}
              </p>

              <p>Complete your payment to confirm your seat. Seats are limited!</p>

              <a href="https://app.neramclasses.com/payment/${data.leadId}" class="button">Pay Now</a>

              <p>If you've already made the payment, please ignore this email.</p>
              <p>Need help? Reply to this email or call us at +91 98765 43210.</p>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | www.neramclasses.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'installment-reminder': {
      subject: '2nd Installment Due - Neram Classes',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">2nd Installment Reminder</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>This is a reminder that your second installment for <strong>${data.course}</strong> is due soon.</p>

              <p style="background: #E3F2FD; padding: 15px; border-radius: 8px; border-left: 4px solid #1565C0;">
                <strong>Amount Due:</strong> Rs. ${data.amount}<br>
                <strong>Due Date:</strong> ${data.dueDate}
              </p>

              <a href="https://app.neramclasses.com/payment/${data.leadId}?installment=2" class="button">Pay 2nd Installment</a>

              <p>If you've already made the payment, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | www.neramclasses.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'cashback-processed': {
      subject: 'Cashback Credited - Neram Classes',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2E7D32, #1B5E20); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .amount { font-size: 2em; color: #2E7D32; font-weight: bold; text-align: center; padding: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Cashback Credited!</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Great news! Your cashback has been processed and credited.</p>

              <div class="amount">Rs. ${data.amount}</div>

              <p style="text-align: center; color: #666;">
                Credited to: ${data.phone}<br>
                Transaction ID: ${data.transactionId}
              </p>

              <p>Thank you for choosing Neram Classes. We wish you all the best for your NATA/JEE preparation!</p>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | www.neramclasses.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'admin-new-application': {
      subject: 'New Application Received - ${data.name}',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1565C0; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #eee; }
            .info-label { font-weight: bold; width: 40%; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">New Application Received</h2>
            </div>
            <div class="content">
              <div class="info-row"><span class="info-label">Name:</span> ${data.name}</div>
              <div class="info-row"><span class="info-label">Email:</span> ${data.email}</div>
              <div class="info-row"><span class="info-label">Phone:</span> ${data.phone}</div>
              <div class="info-row"><span class="info-label">Course:</span> ${data.course}</div>
              <div class="info-row"><span class="info-label">School:</span> ${data.school}</div>
              <div class="info-row"><span class="info-label">Scholarship Applied:</span> ${data.scholarshipApplied ? 'Yes' : 'No'}</div>
              <div class="info-row"><span class="info-label">Source:</span> ${data.source}</div>

              <a href="https://admin.neramclasses.com/leads/${data.leadId}" class="button">Review Application</a>
            </div>
          </div>
        </body>
        </html>
      `,
    },
  };

  return templates[name] || null;
}

/**
 * Send notification to admin
 */
export async function notifyAdmin(
  subject: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `[Admin] ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>${subject}</h2>
        <p>${message}</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This is an automated notification from Neram Classes system.</p>
      </div>
    `,
  });
}

export default {
  sendEmail,
  sendTemplateEmail,
  notifyAdmin,
};
