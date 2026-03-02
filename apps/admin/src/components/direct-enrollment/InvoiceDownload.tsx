// @ts-nocheck
'use client';

import { useCallback, useState } from 'react';
import { Button, CircularProgress } from '@neram/ui';
import DownloadIcon from '@mui/icons-material/Download';

interface InvoiceData {
  studentName: string;
  studentPhone: string;
  courseName: string;
  totalFee: number;
  discountAmount: number;
  finalFee: number;
  amountPaid: number;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: string;
  token: string;
}

interface InvoiceDownloadProps {
  linkData: InvoiceData;
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
}

const ENROLLMENT_URL_BASE = 'https://neramclasses.com/en/enroll?token=';

function formatCurrencyPDF(amount: number): string {
  return `Rs. ${Number(amount).toLocaleString('en-IN')}`;
}

export default function InvoiceDownload({
  linkData,
  variant = 'outlined',
  size = 'medium',
}: InvoiceDownloadProps) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = useCallback(async () => {
    setGenerating(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header background - blue bar
      doc.setFillColor(21, 101, 192);
      doc.rect(0, 0, pageWidth, 45, 'F');

      // Logo text
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('NERAM CLASSES', margin, 22);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Architecture Entrance Exam Coaching', margin, 30);
      doc.text('www.neramclasses.com', margin, 36);

      // Badge on right
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PAYMENT CONFIRMATION', pageWidth - margin, 22, { align: 'right' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const dateStr = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      doc.text(dateStr, pageWidth - margin, 30, { align: 'right' });

      y = 55;

      // Reset text color
      doc.setTextColor(33, 33, 33);

      // Student Details section
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Student Details', margin, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Name: ${linkData.studentName}`, margin, y);
      y += 6;

      if (linkData.studentPhone) {
        doc.text(`Phone: ${linkData.studentPhone}`, margin, y);
        y += 6;
      }

      y += 4;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Course section
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Course', margin, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(linkData.courseName, margin, y);
      y += 10;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Fee Breakdown Table
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Fee Breakdown', margin, y);
      y += 10;

      // Table header
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y - 4, contentWidth, 10, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Description', margin + 4, y + 2);
      doc.text('Amount', pageWidth - margin - 4, y + 2, { align: 'right' });
      y += 12;

      // Table rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      // Total Fee
      doc.text('Total Fee', margin + 4, y);
      doc.text(formatCurrencyPDF(linkData.totalFee), pageWidth - margin - 4, y, { align: 'right' });
      y += 8;

      // Discount (if any)
      if (linkData.discountAmount > 0) {
        doc.setTextColor(46, 125, 50);
        doc.text('Discount', margin + 4, y);
        doc.text(`- ${formatCurrencyPDF(linkData.discountAmount)}`, pageWidth - margin - 4, y, { align: 'right' });
        y += 8;
        doc.setTextColor(33, 33, 33);
      }

      // Final Fee line
      doc.setDrawColor(200, 200, 200);
      doc.line(margin + 4, y, pageWidth - margin - 4, y);
      y += 7;

      doc.setFont('helvetica', 'bold');
      doc.text('Final Fee', margin + 4, y);
      doc.text(formatCurrencyPDF(linkData.finalFee), pageWidth - margin - 4, y, { align: 'right' });
      y += 8;

      // Amount Paid
      doc.setTextColor(46, 125, 50);
      doc.setFontSize(11);
      doc.text('Amount Paid', margin + 4, y);
      doc.text(formatCurrencyPDF(linkData.amountPaid), pageWidth - margin - 4, y, { align: 'right' });
      y += 8;
      doc.setTextColor(33, 33, 33);

      // Balance Due
      const balanceDue = Math.max(0, linkData.finalFee - linkData.amountPaid);
      if (balanceDue > 0) {
        doc.setTextColor(198, 40, 40);
        doc.setFontSize(10);
        doc.text('Balance Due', margin + 4, y);
        doc.text(formatCurrencyPDF(balanceDue), pageWidth - margin - 4, y, { align: 'right' });
        y += 8;
        doc.setTextColor(33, 33, 33);
      }

      y += 6;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Payment Details
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Details', margin, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      doc.text(`Payment Method: ${linkData.paymentMethod}`, margin, y);
      y += 6;

      if (linkData.transactionReference) {
        doc.text(`Transaction Reference: ${linkData.transactionReference}`, margin, y);
        y += 6;
      }

      if (linkData.paymentDate) {
        const paidDate = new Date(linkData.paymentDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        doc.text(`Payment Date: ${paidDate}`, margin, y);
        y += 6;
      }

      y += 8;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Enrollment Link
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Enrollment Link', margin, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(21, 101, 192);
      const enrollmentUrl = `${ENROLLMENT_URL_BASE}${linkData.token}`;
      doc.text(enrollmentUrl, margin, y);
      y += 12;

      doc.setTextColor(33, 33, 33);

      // Footer
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(21, 101, 192);
      doc.text('Complete your enrollment at the link above', pageWidth / 2, y, { align: 'center' });
      y += 6;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(130, 130, 130);
      doc.text('This is a computer-generated document and does not require a signature.', pageWidth / 2, y, { align: 'center' });
      y += 5;
      doc.text('For queries, contact: support@neramclasses.com', pageWidth / 2, y, { align: 'center' });

      // Save
      const safeName = linkData.studentName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const fileName = `Neram_PaymentConfirmation_${safeName}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Failed to generate payment confirmation PDF:', error);
    } finally {
      setGenerating(false);
    }
  }, [linkData]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={generatePDF}
      disabled={generating}
      startIcon={generating ? <CircularProgress size={16} /> : <DownloadIcon />}
      sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none', flex: 1, minWidth: 140 }}
    >
      {generating ? 'Generating...' : 'Download Confirmation'}
    </Button>
  );
}
