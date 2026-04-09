import { Resend } from 'resend';
import type { AutoMessageType } from '../types';

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

const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'Neram Classes <noreply@neramclasses.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@neramclasses.com';

export interface EmailData {
  from?: string;
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
      from: data.from || FROM_EMAIL,
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
  } catch (err: any) {
    console.error('Email service error:', err);
    return { success: false, error: err?.message ?? 'Failed to send email' };
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
      subject: `Application Approved${data.applicationNumber ? ` (${data.applicationNumber})` : ''} - Complete Your Payment`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2E7D32, #1B5E20); color: white; padding: 35px 30px; text-align: center; border-radius: 12px 12px 0 0; }
            .header h1 { margin: 0; font-size: 28px; }
            .header p { margin: 8px 0 0; font-size: 16px; opacity: 0.9; }
            .content { background: #ffffff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
            .greeting { font-size: 16px; margin-bottom: 5px; }
            .button { display: inline-block; background: linear-gradient(135deg, #2E7D32, #1B5E20); color: white !important; padding: 14px 36px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; font-size: 16px; }
            .fee-box { background: #f8faf8; padding: 24px; border-radius: 10px; margin: 20px 0; border: 1px solid #e8f5e9; }
            .fee-box h3 { margin-top: 0; color: #2E7D32; font-size: 16px; }
            .fee-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
            .fee-total { font-size: 1.3em; font-weight: bold; color: #1565C0; }
            .savings-badge { background: #e8f5e9; color: #2E7D32; padding: 10px 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; font-weight: 600; text-align: center; }
            .installment-box { background: #f3f0ff; padding: 16px 20px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #7c4dff; }
            .installment-box h4 { margin: 0 0 8px; color: #5c2db8; font-size: 14px; }
            .installment-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
            .coupon-box { background: #FFF3E0; padding: 16px 20px; border-radius: 8px; border-left: 4px solid #FF9800; margin: 16px 0; }
            .steps-box { background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .steps-box h4 { margin: 0 0 12px; color: #1565C0; font-size: 15px; }
            .step { display: flex; align-items: flex-start; margin-bottom: 10px; font-size: 14px; }
            .step-num { background: #1565C0; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 10px; flex-shrink: 0; }
            .ref-box { background: #fafafa; padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-size: 13px; color: #666; }
            .footer { text-align: center; padding: 24px 20px; color: #999; font-size: 12px; }
            .footer a { color: #2E7D32; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Congratulations!</h1>
              <p>Your application has been approved</p>
            </div>
            <div class="content">
              <p class="greeting">Dear <strong>${data.name}</strong>,</p>
              <p>We are pleased to inform you that your application for <strong>${data.course}</strong> at Neram Classes has been <strong style="color: #2E7D32;">approved</strong>.</p>

              ${data.applicationNumber ? `
              <div class="ref-box">
                <strong>Application No:</strong> ${data.applicationNumber}
              </div>
              ` : ''}

              <div class="fee-box">
                <h3>Fee Summary</h3>
                <div class="fee-row">
                  <span>Course Fee</span>
                  <span>Rs. ${Number(data.baseFee).toLocaleString('en-IN')}</span>
                </div>
                ${Number(data.scholarshipDiscount) > 0 ? `
                <div class="fee-row" style="color: #2E7D32;">
                  <span>Scholarship Discount (${data.scholarshipPercentage}%)</span>
                  <span>- Rs. ${Number(data.scholarshipDiscount).toLocaleString('en-IN')}</span>
                </div>
                ` : ''}
                ${Number(data.fullPaymentDiscount) > 0 ? `
                <div class="fee-row" style="color: #2E7D32;">
                  <span>Full Payment Discount</span>
                  <span>- Rs. ${Number(data.fullPaymentDiscount).toLocaleString('en-IN')}</span>
                </div>
                ` : ''}
                <div class="fee-row fee-total" style="border: none; padding-top: 15px;">
                  <span>Amount to Pay</span>
                  <span>Rs. ${Number(data.finalFee).toLocaleString('en-IN')}</span>
                </div>
              </div>

              ${Number(data.fullPaymentDiscount) > 0 ? `
              <div class="savings-badge">
                Save Rs. ${Number(data.fullPaymentDiscount).toLocaleString('en-IN')} by paying in full!
              </div>
              ` : ''}

              ${data.allowedPaymentModes === 'full_and_installment' && Number(data.installment1Amount) > 0 ? `
              <div class="installment-box">
                <h4>Installment Option Available</h4>
                <div class="installment-row">
                  <span>1st Installment (due now)</span>
                  <span><strong>Rs. ${Number(data.installment1Amount).toLocaleString('en-IN')}</strong></span>
                </div>
                <div class="installment-row">
                  <span>2nd Installment (due in ${data.installment2DueDays || 45} days)</span>
                  <span><strong>Rs. ${Number(data.installment2Amount).toLocaleString('en-IN')}</strong></span>
                </div>
              </div>
              ` : ''}

              ${data.couponCode ? `
              <div class="coupon-box">
                <strong>Your Coupon Code:</strong> <code style="background: #fff; padding: 4px 10px; border-radius: 4px; font-size: 1.1em; font-weight: bold;">${data.couponCode}</code><br>
                <span style="font-size: 13px; color: #666;">Apply this code during payment for additional discount!</span>
              </div>
              ` : ''}

              <p style="font-size: 15px;"><strong>Payment Deadline:</strong> ${data.paymentDeadline}</p>

              <div class="steps-box">
                <h4>Next Steps</h4>
                <div class="step">
                  <span class="step-num">1</span>
                  <span>Click the button below to go to the payment page</span>
                </div>
                <div class="step">
                  <span class="step-num">2</span>
                  <span>Choose your payment mode (Full payment${data.allowedPaymentModes === 'full_and_installment' ? ' or Installment' : ''})</span>
                </div>
                <div class="step">
                  <span class="step-num">3</span>
                  <span>Complete the payment via UPI, Bank Transfer, or Card</span>
                </div>
                <div class="step">
                  <span class="step-num">4</span>
                  <span>Your seat will be confirmed immediately!</span>
                </div>
              </div>

              <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com'}/pay?app=${data.applicationNumber}" class="button">Pay Now & Confirm Your Seat</a>
              </div>

              <p style="color: #666; font-size: 0.9em; text-align: center; margin-top: 8px;">
                Tip: Pay via UPI/Bank Transfer to earn Rs. 100 extra cashback!
              </p>

              <p style="color: #999; font-size: 0.85em; margin-top: 24px;">
                If you have any questions, feel free to reach out to us at <strong>+91 98765 43210</strong> or reply to this email.
              </p>
            </div>
            <div class="footer">
              <p><strong>Neram Classes</strong> - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | <a href="https://www.neramclasses.com">www.neramclasses.com</a></p>
              <p style="margin-top: 8px; font-size: 11px;">This is an automated email from noreply@neramclasses.com. Please do not reply directly to this address.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'payment-confirmation': {
      subject: `Payment Confirmed${data.receiptNumber ? ` (${data.receiptNumber})` : ''} - Welcome to Neram Classes!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2E7D32, #1B5E20); color: white; padding: 35px 30px; text-align: center; border-radius: 12px 12px 0 0; }
            .header h1 { margin: 0; font-size: 26px; }
            .header p { margin: 8px 0 0; font-size: 16px; opacity: 0.9; }
            .content { background: #ffffff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
            .receipt-box { background: #f8faf8; padding: 24px; border-radius: 10px; margin: 20px 0; border: 1px solid #e8f5e9; }
            .receipt-box h3 { margin: 0 0 15px; color: #2E7D32; font-size: 16px; }
            .receipt-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
            .receipt-row:last-child { border-bottom: none; }
            .receipt-total { font-size: 1.2em; font-weight: bold; color: #2E7D32; padding-top: 12px; border-top: 2px solid #2E7D32; }
            .receipt-number { background: #E8F5E9; padding: 12px 16px; border-radius: 8px; text-align: center; margin: 16px 0; }
            .receipt-number span { font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #2E7D32; letter-spacing: 1px; }
            .steps-box { background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .steps-box h4 { margin: 0 0 12px; color: #1565C0; font-size: 15px; }
            .step { display: flex; align-items: flex-start; margin-bottom: 10px; font-size: 14px; }
            .step-num { background: #1565C0; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 10px; flex-shrink: 0; }
            .button { display: inline-block; background: linear-gradient(135deg, #2E7D32, #1B5E20); color: white !important; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
            .footer { text-align: center; padding: 24px 20px; color: #999; font-size: 12px; }
            .footer a { color: #2E7D32; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Confirmed!</h1>
              <p>Welcome to Neram Classes</p>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Congratulations! Your payment has been received and your enrollment is now confirmed.</p>

              ${data.receiptNumber ? `
              <div class="receipt-number">
                <div style="color: #666; font-size: 12px; margin-bottom: 4px;">Receipt Number</div>
                <span>${data.receiptNumber}</span>
              </div>
              ` : ''}

              <div class="receipt-box">
                <h3>Payment Receipt</h3>
                <div class="receipt-row">
                  <span>Course</span>
                  <span><strong>${data.course}</strong></span>
                </div>
                <div class="receipt-row">
                  <span>Amount Paid</span>
                  <span><strong>Rs. ${data.amount}</strong></span>
                </div>
                <div class="receipt-row">
                  <span>Payment ID</span>
                  <span style="font-family: monospace; font-size: 13px;">${data.paymentId}</span>
                </div>
                <div class="receipt-row">
                  <span>Date</span>
                  <span>${data.date}</span>
                </div>
              </div>

              ${Number(data.cashback) > 0 ? `
              <p style="background: #E8F5E9; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50;">
                <strong>Cashback Earned: Rs. ${data.cashback}</strong><br>
                This will be transferred to your registered mobile number within 7 days.
              </p>
              ` : ''}

              <div class="steps-box">
                <h4>What's Next?</h4>
                <div class="step">
                  <span class="step-num">1</span>
                  <span>A confirmation email has been sent to your inbox (this email!)</span>
                </div>
                <div class="step">
                  <span class="step-num">2</span>
                  <span>You'll be assigned to a batch within <strong>2 business days</strong></span>
                </div>
                <div class="step">
                  <span class="step-num">3</span>
                  <span>Join our WhatsApp group for class updates and study materials</span>
                </div>
                <div class="step">
                  <span class="step-num">4</span>
                  <span>Access your online classroom on Neram Nexus</span>
                </div>
              </div>

              <div style="text-align: center;">
                <a href="https://app.neramclasses.com/dashboard" class="button">Go to Dashboard</a>
              </div>

              <p style="color: #999; font-size: 0.85em; margin-top: 24px; text-align: center;">
                Keep this email as your payment receipt. If you have any questions, reach out at <strong>support@neramclasses.com</strong>.
              </p>
            </div>
            <div class="footer">
              <p><strong>Neram Classes</strong> - Architecture Entrance Coaching</p>
              <p>Chennai, Tamil Nadu | <a href="https://www.neramclasses.com">www.neramclasses.com</a></p>
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
      subject: `New Application Received - ${data.name}`,
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

    'application-confirmation': {
      subject: `Application Received - ${data.applicationNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0 0 10px; font-size: 28px; }
            .header p { margin: 0; opacity: 0.9; }
            .content { padding: 30px; background: #fff; }
            .app-number { background: #E3F2FD; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .app-number-label { color: #666; font-size: 14px; margin-bottom: 5px; }
            .app-number-value { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #1565C0; letter-spacing: 2px; }
            .section { margin: 25px 0; }
            .section-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 15px; border-bottom: 2px solid #1565C0; padding-bottom: 8px; display: inline-block; }
            .info-grid { display: table; width: 100%; }
            .info-row { display: table-row; }
            .info-label { display: table-cell; padding: 8px 15px 8px 0; color: #666; width: 40%; }
            .info-value { display: table-cell; padding: 8px 0; font-weight: 500; }
            .steps { background: #F5F5F5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .step { display: flex; margin: 15px 0; align-items: flex-start; }
            .step-num { background: #1565C0; color: white; min-width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; font-size: 14px; }
            .step-text { flex: 1; line-height: 1.5; }
            .cta { text-align: center; margin: 30px 0; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; }
            .footer { background: #F5F5F5; padding: 20px 30px; text-align: center; color: #666; font-size: 13px; }
            .contact { margin-top: 15px; }
            .contact a { color: #1565C0; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Application Received!</h1>
              <p>Thank you for applying to Neram Classes</p>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>We're excited to have you begin your journey with Neram Classes! Your application has been successfully submitted and is now under review.</p>

              <div class="app-number">
                <div class="app-number-label">Your Application Number</div>
                <div class="app-number-value">${data.applicationNumber}</div>
              </div>

              <div class="section">
                <div class="section-title">Application Summary</div>
                <div class="info-grid">
                  <div class="info-row">
                    <div class="info-label">Course Interest:</div>
                    <div class="info-value">${data.course}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Applicant Category:</div>
                    <div class="info-value">${data.category}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Target Exam Year:</div>
                    <div class="info-value">${data.targetYear}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Phone:</div>
                    <div class="info-value">${data.phone} (Verified ✓)</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Location:</div>
                    <div class="info-value">${data.location}</div>
                  </div>
                </div>
              </div>

              <div class="steps">
                <div class="section-title" style="border-bottom: none; padding-bottom: 0;">What happens next?</div>
                <div class="step">
                  <div class="step-num">1</div>
                  <div class="step-text">Our counselor will review your application within <strong>24-48 hours</strong></div>
                </div>
                <div class="step">
                  <div class="step-num">2</div>
                  <div class="step-text">You'll receive a call to discuss course details, batch timing, and fees</div>
                </div>
                <div class="step">
                  <div class="step-num">3</div>
                  <div class="step-text">Complete payment to confirm your enrollment and get started!</div>
                </div>
              </div>

              <div class="cta">
                <a href="https://app.neramclasses.com/my-applications" class="button">Track Application Status</a>
              </div>

              <p style="color: #666; font-size: 14px;">
                Have questions? Reply to this email or reach us at the contact details below.
              </p>
            </div>
            <div class="footer">
              <strong>Neram Classes</strong> - Architecture Entrance Coaching
              <div class="contact">
                <a href="tel:+919876543210">+91 98765 43210</a> |
                <a href="mailto:support@neramclasses.com">support@neramclasses.com</a>
              </div>
              <div style="margin-top: 10px;">Chennai, Tamil Nadu | www.neramclasses.com</div>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'admin-application-notification': {
      subject: `[New Application] ${data.applicationNumber} - ${data.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #1565C0; color: white; padding: 20px; }
            .header h2 { margin: 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
            .badge-new { background: #E8F5E9; color: #2E7D32; }
            .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .info-table td { padding: 10px; border-bottom: 1px solid #ddd; }
            .info-table td:first-child { font-weight: 600; width: 40%; color: #666; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
            .urgent { background: #FFF3E0; padding: 15px; border-left: 4px solid #FF9800; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>New Application Received</h2>
            </div>
            <div class="content">
              <p><span class="badge badge-new">NEW</span> A new application has been submitted</p>

              <table class="info-table">
                <tr><td>Application #:</td><td><strong>${data.applicationNumber}</strong></td></tr>
                <tr><td>Name:</td><td>${data.name}</td></tr>
                <tr><td>Father's Name:</td><td>${data.fatherName || 'Not provided'}</td></tr>
                <tr><td>Email:</td><td><a href="mailto:${data.email}">${data.email}</a></td></tr>
                <tr><td>Phone:</td><td><a href="tel:${data.phone}">${data.phone}</a> ${data.phoneVerified ? '✓ Verified' : ''}</td></tr>
                <tr><td>Course Interest:</td><td>${data.course}</td></tr>
                <tr><td>Category:</td><td>${data.category}</td></tr>
                <tr><td>Target Year:</td><td>${data.targetYear}</td></tr>
                <tr><td>Location:</td><td>${data.location}</td></tr>
                <tr><td>Hybrid Learning:</td><td>${data.hybridLearning ? 'Yes' : 'No'}</td></tr>
                <tr><td>Preferred Center:</td><td>${data.center || 'None selected'}</td></tr>
                <tr><td>Source:</td><td>${data.source}${data.utmSource ? ' (' + data.utmSource + ')' : ''}</td></tr>
                <tr><td>Submitted At:</td><td>${data.submittedAt}</td></tr>
              </table>

              ${data.academicInfo ? `
              <div class="urgent">
                <strong>Academic Details:</strong><br>
                ${data.academicInfo}
              </div>
              ` : ''}

              <a href="https://admin.neramclasses.com/applications/${data.applicationId}" class="button">Review Application</a>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    // ============================================
    // REFUND EMAIL TEMPLATES
    // ============================================

    'refund-request-submitted': {
      subject: 'Refund Request Received - Neram Classes',
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
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Refund Request Received</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>We have received your refund request. Our team will review it and get back to you within 24-48 business hours.</p>
              <div class="info-box">
                <h3 style="margin-top: 0;">Request Summary</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0;">Payment Amount:</td><td style="padding: 8px 0; text-align: right;"><strong>Rs. ${data.paymentAmount?.toLocaleString?.('en-IN') || data.paymentAmount}</strong></td></tr>
                  <tr><td style="padding: 8px 0;">Processing Fee (30%):</td><td style="padding: 8px 0; text-align: right; color: #E65100;">- Rs. ${data.processingFee?.toLocaleString?.('en-IN') || data.processingFee}</td></tr>
                  <tr style="border-top: 2px solid #ddd;"><td style="padding: 8px 0;"><strong>Eligible Refund Amount:</strong></td><td style="padding: 8px 0; text-align: right;"><strong>Rs. ${data.refundAmount?.toLocaleString?.('en-IN') || data.refundAmount}</strong></td></tr>
                </table>
              </div>
              <p style="background: #FFF3E0; padding: 15px; border-radius: 8px; border-left: 4px solid #F57C00; font-size: 14px;">
                <strong>Please note:</strong> Refund approval is at the sole discretion of Neram Classes administration. A 30% processing fee is applicable on all approved refunds. You will be notified via email and WhatsApp once a decision is made.
              </p>
              <p>If you have any questions, please contact us at <strong>support@neramclasses.com</strong>.</p>
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

    'refund-approved': {
      subject: 'Refund Approved - Neram Classes',
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
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Refund Approved</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Your refund request has been approved. Here are the details:</p>
              <div class="info-box">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0;">Original Payment:</td><td style="padding: 8px 0; text-align: right;">Rs. ${data.paymentAmount?.toLocaleString?.('en-IN') || data.paymentAmount}</td></tr>
                  <tr><td style="padding: 8px 0;">Processing Fee (30%):</td><td style="padding: 8px 0; text-align: right; color: #666;">Deducted</td></tr>
                  <tr style="border-top: 2px solid #2E7D32;"><td style="padding: 8px 0;"><strong>Refund Amount:</strong></td><td style="padding: 8px 0; text-align: right; color: #2E7D32;"><strong>Rs. ${data.refundAmount?.toLocaleString?.('en-IN') || data.refundAmount}</strong></td></tr>
                </table>
              </div>
              <p>The refund will be processed to your original payment method within <strong>5-10 business days</strong>.</p>
              <p>If you have any questions about the refund timeline, please contact us at <strong>support@neramclasses.com</strong>.</p>
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

    'refund-rejected': {
      subject: 'Refund Request Update - Neram Classes',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #C62828, #B71C1C); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .reason-box { background: #FFF3E0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F57C00; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Refund Request Update</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>After careful review, your refund request for the payment of <strong>Rs. ${data.paymentAmount?.toLocaleString?.('en-IN') || data.paymentAmount}</strong> has not been approved.</p>
              ${data.adminNotes ? `
              <div class="reason-box">
                <strong>Reason:</strong><br>
                ${data.adminNotes}
              </div>
              ` : ''}
              <p>As stated in our Refund Policy, all refund decisions are at the sole discretion of Neram Classes administration.</p>
              <p>Your enrollment remains active and we encourage you to make the most of the learning opportunities. If you have further concerns, please reach out to us at <strong>support@neramclasses.com</strong>.</p>
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

    'admin-payment-received': {
      subject: `[Payment] Rs. ${data.amount} received from ${data.studentName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2E7D32; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .header h2 { margin: 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .info-table td { padding: 10px; border-bottom: 1px solid #ddd; }
            .info-table td:first-child { font-weight: 600; width: 40%; color: #666; }
            .amount { font-size: 1.5em; color: #2E7D32; font-weight: bold; text-align: center; padding: 15px; background: #E8F5E9; border-radius: 8px; margin: 15px 0; }
            .button { display: inline-block; background: #1565C0; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Payment Received</h2>
            </div>
            <div class="content">
              <div class="amount">Rs. ${data.amount}</div>
              <table class="info-table">
                <tr><td>Student:</td><td><strong>${data.studentName}</strong></td></tr>
                <tr><td>Email:</td><td>${data.studentEmail}</td></tr>
                <tr><td>Phone:</td><td>${data.studentPhone}</td></tr>
                <tr><td>Course:</td><td>${data.course}</td></tr>
                <tr><td>Payment Type:</td><td>${data.paymentScheme}</td></tr>
                <tr><td>Receipt #:</td><td><strong>${data.receiptNumber}</strong></td></tr>
                <tr><td>Razorpay ID:</td><td><code>${data.razorpayId}</code></td></tr>
                <tr><td>Date:</td><td>${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td></tr>
              </table>
              <a href="https://admin.neramclasses.com/payments" class="button">View in Admin Panel</a>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    'team-refund-request': {
      subject: 'New Refund Request - Action Required',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #C62828, #B71C1C); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
            .button { display: inline-block; background: #C62828; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>New Refund Request</h2>
            </div>
            <div class="content">
              <p>A new refund request has been submitted and requires your review.</p>
              <div class="info-box">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0;">Student:</td><td style="padding: 8px 0;"><strong>${data.user_name || data.userName || 'Unknown'}</strong></td></tr>
                  <tr><td style="padding: 8px 0;">Phone:</td><td style="padding: 8px 0;">${data.phone || ''}</td></tr>
                  <tr><td style="padding: 8px 0;">Payment Amount:</td><td style="padding: 8px 0;">Rs. ${data.payment_amount || data.paymentAmount || 0}</td></tr>
                  <tr><td style="padding: 8px 0;">Refund Amount (70%):</td><td style="padding: 8px 0; color: #C62828;"><strong>Rs. ${data.refund_amount || data.refundAmount || 0}</strong></td></tr>
                  <tr><td style="padding: 8px 0;">Reason:</td><td style="padding: 8px 0;">${data.reason_for_discontinuing || data.reasonForDiscontinuing || 'Not specified'}</td></tr>
                </table>
              </div>
              <a href="https://admin.neramclasses.com/crm" class="button">Review in Admin CRM</a>
            </div>
            <div class="footer">
              <p>This is an automated notification from Neram Classes.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },

    // ============================================
    // SUPPORT TICKET EMAIL TEMPLATES
    // ============================================

    'ticket-confirmation': {
      subject: `Support Ticket Created - ${data.ticketNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .ticket-box { background: #E3F2FD; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .ticket-label { color: #666; font-size: 14px; margin-bottom: 5px; }
            .ticket-number { font-family: 'Courier New', monospace; font-size: 22px; font-weight: bold; color: #1565C0; letter-spacing: 1px; }
            .detail-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
            .detail-row { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
            .detail-label { font-weight: 600; color: #666; font-size: 13px; }
            .detail-value { margin-top: 2px; }
            .note { background: #FFF3E0; padding: 15px; border-radius: 8px; border-left: 4px solid #FF9800; margin: 20px 0; font-size: 14px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Support Ticket Created</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${data.userName}</strong>,</p>
              <p>Your support ticket has been created successfully. Our team will review it and get back to you as soon as possible.</p>

              <div class="ticket-box">
                <div class="ticket-label">Your Ticket Number</div>
                <div class="ticket-number">${data.ticketNumber}</div>
              </div>

              <div class="detail-box">
                <div class="detail-row">
                  <div class="detail-label">Subject</div>
                  <div class="detail-value">${data.subject}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Category</div>
                  <div class="detail-value">${data.category}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Description</div>
                  <div class="detail-value">${data.description}</div>
                </div>
              </div>

              <div class="note">
                <strong>Please save your ticket number:</strong> ${data.ticketNumber}<br>
                You can reference this number if you need to follow up with our team.
              </div>

              <p>If you need further assistance, reply to this email or contact us at <strong>+91 9176137043</strong>.</p>
            </div>
            <div class="footer">
              <p>Neram Classes - Architecture Entrance Coaching</p>
              <p>Bangalore, Karnataka | www.neramclasses.com</p>
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

/**
 * Send first-touch welcome email to users who signed up with Google only (no phone).
 * Matches Hari's personal tone from the WhatsApp templates.
 */
export async function sendFirstTouchEmail(
  email: string,
  data: { userName: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const name = data.userName || 'there';

  return sendEmail({
    to: email,
    subject: `Hi ${name}, welcome to Neram Classes!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; margin: 0; padding: 0; }
          .container { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
          .greeting { font-size: 18px; margin-bottom: 16px; }
          .body-text { font-size: 15px; color: #444; margin-bottom: 14px; }
          .cta-btn { display: inline-block; background: #1565C0; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 20px 0; }
          .signature { margin-top: 28px; font-size: 15px; color: #444; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <p class="greeting">Hi ${name} 👋</p>

          <p class="body-text">This is Hari from Neram Classes. Thanks for checking out our NATA/JEE tools. Hope they helped!</p>

          <p class="body-text">Quick intro: I'm a B.Arch graduate from NIT Trichy and I personally train every student here. Our student scored AIR 1 in JEE B.Arch, and we consistently hit 99.9 percentile results.</p>

          <p class="body-text">Quick question: are you preparing for NATA 2026, JEE Paper 2, or both? Just reply to this email and I'll point you to the right resources 🙂</p>

          <a href="https://app.neramclasses.com" class="cta-btn" style="color: #ffffff;">Explore Free Tools →</a>

          <div class="signature">
            <p>Cheers,<br><strong>Hari</strong><br>Founder, Neram Classes<br>NIT Trichy B.Arch</p>
          </div>

          <div class="footer">
            <p>Neram Classes: Expert coaching for NATA and JEE Paper 2</p>
            <p>neramclasses.com</p>
          </div>
        </div>
      </body>
      </html>
    `,
    replyTo: 'hari@neramclasses.com',
  });
}

/**
 * Send a phone-verification drip email.
 * 5 templates: phone_drip_1 (30min) through phone_drip_5 (Day 14).
 * Sent from info@neramclasses.com with an unsubscribe link.
 */
export async function sendPhoneDripEmail(
  email: string,
  messageType: AutoMessageType,
  data: { userName: string; unsubscribeUrl: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const name = data.userName || 'there';
  const unsubUrl = data.unsubscribeUrl;
  const appUrl = 'https://app.neramclasses.com';

  const unsubscribeFooter = `
    <div style="text-align:center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #eee; margin-top: 30px;">
      <p>Neram Classes, Chennai, Tamil Nadu</p>
      <p>neramclasses.com</p>
      <p><a href="${unsubUrl}" style="color: #999;">Unsubscribe from these emails</a></p>
    </div>
  `;

  const wrapHtml = (content: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
        .header { background: #1565C0; color: white; padding: 24px 30px; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #1565C0; color: white !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        p { margin: 0 0 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Neram Classes</h1></div>
        <div class="content">${content}</div>
        ${unsubscribeFooter}
      </div>
    </body>
    </html>
  `;

  const templates: Record<string, { subject: string; html: string }> = {
    phone_drip_1: {
      subject: `Hi ${name}, your Neram Classes registration is not complete`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>This is a quick note from the Neram Classes team.</p>
        <p>We noticed your account registration was not fully completed, specifically the phone verification step. This is usually a quick process, and we can help if you faced any difficulty.</p>
        <p>If you are still interested in NATA 2026 or JEE Paper 2 B.Arch preparation, feel free to reach out and we will get you sorted.</p>
        <a href="${appUrl}" class="button">Complete Registration</a>
        <p>You can also reach us directly:<br>
        +91-91761-37043 (Call or WhatsApp)</p>
        <p>No action needed if you have already moved on. We just wanted to make sure you did not face any barriers on our end.</p>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_2: {
      subject: `${name}, quick question`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>Just checking in. Phone verification on Neram Classes takes about 30 seconds. Once done, you can explore our NATA and JEE B.Arch prep tools.</p>
        <p>If you hit any trouble yesterday, reply to this email and we will help you through it.</p>
        <a href="${appUrl}" class="button">Verify Phone Now</a>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_3: {
      subject: `NATA 2026 students are already preparing`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>Students who started their NATA preparation early consistently score higher. Our 2025 batch had students crack NATA with scores above 120 within 3 months of joining.</p>
        <p>Your account is set up. The only thing left is phone verification, which takes under a minute.</p>
        <a href="${appUrl}" class="button">Complete Setup</a>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_4: {
      subject: `New batch is filling up, ${name}`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>Our upcoming NATA 2026 and JEE Paper 2 B.Arch batch is accepting registrations now. Seats are limited.</p>
        <p>To check eligibility and apply, you need to first complete phone verification on your account.</p>
        <a href="${appUrl}" class="button">Secure Your Spot</a>
        <p>Call or WhatsApp: +91-91761-37043</p>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_5: {
      subject: `Last message from us, ${name}`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>We will not keep following up after this. If NATA or JEE B.Arch preparation is not on your radar right now, that is completely fine.</p>
        <p>When you are ready, we are at neramclasses.com or +91-91761-37043.</p>
        <p>Wishing you all the best,<br>Neram Classes Team</p>
      `),
    },
  };

  const template = templates[messageType];
  if (!template) {
    return { success: false, error: `Unknown phone drip template: ${messageType}` };
  }

  const result = await sendEmail({
    from: 'Neram Classes <info@neramclasses.com>',
    to: email,
    subject: template.subject,
    html: template.html,
    replyTo: 'info@neramclasses.com',
  });

  return { ...result, messageId: undefined };
}

export default {
  sendEmail,
  sendTemplateEmail,
  notifyAdmin,
  sendFirstTouchEmail,
  sendPhoneDripEmail,
};
