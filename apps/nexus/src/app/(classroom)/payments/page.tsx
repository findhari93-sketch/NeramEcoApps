'use client';

import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  useMediaQuery,
  useTheme,
  Card,
  CardContent,
  Divider,
} from '@neram/ui';

interface Payment {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
  invoiceUrl: string;
}

export default function PaymentsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const payments: Payment[] = [
    {
      id: 'INV-001',
      date: '2025-01-15',
      amount: 5000,
      status: 'paid',
      description: 'Monthly Tuition - January 2025',
      invoiceUrl: '#',
    },
    {
      id: 'INV-002',
      date: '2024-12-15',
      amount: 5000,
      status: 'paid',
      description: 'Monthly Tuition - December 2024',
      invoiceUrl: '#',
    },
    {
      id: 'INV-003',
      date: '2024-11-15',
      amount: 5000,
      status: 'paid',
      description: 'Monthly Tuition - November 2024',
      invoiceUrl: '#',
    },
    {
      id: 'INV-004',
      date: '2024-10-15',
      amount: 5000,
      status: 'paid',
      description: 'Monthly Tuition - October 2024',
      invoiceUrl: '#',
    },
  ];

  const getStatusColor = (status: Payment['status']) => {
    switch (status) {
      case 'paid':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          Payment History
        </Typography>
        <Typography variant="body1" color="text.secondary">
          View your payment transactions and download invoices
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Card sx={{ flex: '1 1 300px' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Total Paid
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {formatCurrency(payments.reduce((sum, p) => sum + (p.status === 'paid' ? p.amount : 0), 0))}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 300px' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Total Transactions
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {payments.length}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Payment Table - Desktop */}
      {!isMobile && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Invoice ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Amount
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id} hover>
                  <TableCell>{payment.id}</TableCell>
                  <TableCell>{formatDate(payment.date)}</TableCell>
                  <TableCell>{payment.description}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatCurrency(payment.amount)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={payment.status.toUpperCase()}
                      color={getStatusColor(payment.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {payment.status === 'paid' && (
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: 'none' }}
                      >
                        Download Invoice
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Payment Cards - Mobile */}
      {isMobile && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {payment.id}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {formatCurrency(payment.amount)}
                    </Typography>
                  </Box>
                  <Chip
                    label={payment.status.toUpperCase()}
                    color={getStatusColor(payment.status)}
                    size="small"
                  />
                </Box>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="body2" gutterBottom>
                  {payment.description}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  {formatDate(payment.date)}
                </Typography>
                {payment.status === 'paid' && (
                  <Button
                    size="small"
                    variant="outlined"
                    fullWidth
                    sx={{ textTransform: 'none' }}
                  >
                    Download Invoice
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
