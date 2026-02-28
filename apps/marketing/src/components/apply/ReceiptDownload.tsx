'use client';

import { useCallback, useState } from 'react';
import { Button, CircularProgress } from '@neram/ui';
import DownloadIcon from '@mui/icons-material/Download';

interface ReceiptData {
  receiptNumber: string;
  amount: number;
  razorpayPaymentId?: string;
  paidAt: string;
  courseName: string;
  paymentScheme?: string;
  studentName?: string;
}

interface ReceiptDownloadProps {
  receiptData: ReceiptData;
  studentName?: string;
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
}

export default function ReceiptDownload({
  receiptData,
  studentName,
  variant = 'outlined',
  size = 'medium',
  fullWidth = false,
}: ReceiptDownloadProps) {
  const [generating, setGenerating] = useState(false);

  const generateReceipt = useCallback(async () => {
    setGenerating(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header background
      doc.setFillColor(21, 101, 192); // #1565C0
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

      // Receipt badge on right
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('FEE RECEIPT', pageWidth - margin, 22, { align: 'right' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(receiptData.receiptNumber, pageWidth - margin, 30, { align: 'right' });

      y = 55;

      // Reset text color
      doc.setTextColor(33, 33, 33);

      // Student info section
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Student Details', margin, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const name = studentName || receiptData.studentName || 'Student';
      doc.text(`Name: ${name}`, margin, y);
      y += 6;

      const paidDate = new Date(receiptData.paidAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      doc.text(`Date: ${paidDate}`, margin, y);
      y += 12;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // Payment details table
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Details', margin, y);
      y += 10;

      // Table header
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y - 4, contentWidth, 10, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Description', margin + 4, y + 2);
      doc.text('Amount', pageWidth - margin - 4, y + 2, { align: 'right' });
      y += 12;

      // Table row
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(receiptData.courseName, margin + 4, y);
      doc.text(
        `Rs. ${Number(receiptData.amount).toLocaleString('en-IN')}`,
        pageWidth - margin - 4,
        y,
        { align: 'right' }
      );
      y += 8;

      if (receiptData.paymentScheme) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const schemeLabel = receiptData.paymentScheme === 'full' ? 'Full Payment' : 'Installment Payment';
        doc.text(`Payment Type: ${schemeLabel}`, margin + 4, y);
        y += 8;
        doc.setTextColor(33, 33, 33);
      }

      // Total row
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Total Paid', margin + 4, y);
      doc.setTextColor(46, 125, 50); // green
      doc.text(
        `Rs. ${Number(receiptData.amount).toLocaleString('en-IN')}`,
        pageWidth - margin - 4,
        y,
        { align: 'right' }
      );
      y += 15;

      // Payment reference
      doc.setTextColor(33, 33, 33);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      if (receiptData.razorpayPaymentId) {
        doc.text(`Razorpay Payment ID: ${receiptData.razorpayPaymentId}`, margin, y);
        y += 6;
      }
      doc.text(`Receipt Number: ${receiptData.receiptNumber}`, margin, y);
      y += 6;
      doc.text(`Payment Method: Online (Razorpay)`, margin, y);
      y += 15;

      // Footer divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text('This is a computer-generated receipt and does not require a signature.', pageWidth / 2, y, { align: 'center' });
      y += 5;
      doc.text('For queries, contact: support@neramclasses.com', pageWidth / 2, y, { align: 'center' });

      // Save
      const fileName = `Neram_Receipt_${receiptData.receiptNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Failed to generate receipt:', error);
    } finally {
      setGenerating(false);
    }
  }, [receiptData, studentName]);

  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      onClick={generateReceipt}
      disabled={generating}
      startIcon={generating ? <CircularProgress size={16} /> : <DownloadIcon />}
      sx={{ borderRadius: 1, fontWeight: 600 }}
    >
      {generating ? 'Generating...' : 'Download Receipt'}
    </Button>
  );
}
