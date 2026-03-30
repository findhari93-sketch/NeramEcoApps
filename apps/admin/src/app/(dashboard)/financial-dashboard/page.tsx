// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Alert, CircularProgress, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@neram/ui';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PercentIcon from '@mui/icons-material/Percent';
import PeopleIcon from '@mui/icons-material/People';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCategoryLabel, getCategoryColor, formatCurrency } from '@/components/expenses/ExpenseConstants';

function KPICard({ title, value, subtitle, icon, color, loading }: {
  title: string; value: string; subtitle?: string; icon: React.ReactNode; color: string; loading: boolean;
}) {
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', flex: 1, minWidth: 170 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>{loading ? '...' : value}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

const CHART_COLORS = ['#1976D2', '#E64A19', '#7B1FA2', '#0097A7', '#388E3C', '#F57C00', '#5C6BC0', '#455A64', '#795548', '#9E9E9E'];

export default function FinancialDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Default: current month
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const fetchDashboard = useCallback(async () => {
    if (startDate > endDate) {
      setError('Start date must be before end date');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/financial-dashboard?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const s = data?.summary || {};
  const profitColor = s.net_profit >= 0 ? '#388E3C' : '#D32F2F';
  const momArrow = s.mom_change >= 0 ? '↑' : '↓';

  // Pie chart data
  const pieData = Object.entries(data?.category_breakdown || {}).map(([key, value]) => ({
    name: getCategoryLabel(key),
    value: value as number,
    color: getCategoryColor(key),
  }));

  // Category table with comparison
  const categoryRows = Object.entries(data?.category_breakdown || {}).map(([cat, amt]) => {
    const prevAmt = (data?.prev_category_breakdown || {})[cat] || 0;
    const change = prevAmt > 0 ? (((amt as number) - prevAmt) / prevAmt) * 100 : 0;
    const pctOfTotal = s.total_expenses > 0 ? ((amt as number) / s.total_expenses) * 100 : 0;
    return { category: cat, amount: amt as number, prevAmount: prevAmt, change, pctOfTotal };
  }).sort((a, b) => b.amount - a.amount);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AnalyticsIcon sx={{ fontSize: 28 }} />
          <Typography variant="h4" fontWeight={700}>Financial Dashboard</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField type="date" label="From" size="small" value={startDate} onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="To" size="small" value={endDate} onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* KPI Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, overflowX: 'auto', pb: 1 }}>
        <KPICard title="Total Income" value={formatCurrency(s.total_income || 0)}
          subtitle={`Fees: ${formatCurrency(s.student_fee_income || 0)} | Side: ${formatCurrency(s.side_income || 0)}`}
          icon={<TrendingUpIcon sx={{ color: '#388E3C', fontSize: 20 }} />} color="#388E3C" loading={loading} />
        <KPICard title="Total Expenses" value={formatCurrency(s.total_expenses || 0)}
          icon={<TrendingDownIcon sx={{ color: '#D32F2F', fontSize: 20 }} />} color="#D32F2F" loading={loading} />
        <KPICard title="Net Profit/Loss" value={formatCurrency(s.net_profit || 0)}
          icon={<AccountBalanceIcon sx={{ color: profitColor, fontSize: 20 }} />} color={profitColor} loading={loading} />
        <KPICard title="Profit Margin" value={`${s.profit_margin || 0}%`}
          icon={<PercentIcon sx={{ color: '#1976D2', fontSize: 20 }} />} color="#1976D2" loading={loading} />
        <KPICard title="Expense / Student" value={formatCurrency(s.expense_per_student || 0)}
          subtitle={`${s.student_count || 0} students`}
          icon={<PeopleIcon sx={{ color: '#7B1FA2', fontSize: 20 }} />} color="#7B1FA2" loading={loading} />
        <KPICard title="MoM Change" value={`${momArrow} ${Math.abs(s.mom_change || 0)}%`}
          icon={<CompareArrowsIcon sx={{ color: s.mom_change >= 0 ? '#388E3C' : '#D32F2F', fontSize: 20 }} />}
          color={s.mom_change >= 0 ? '#388E3C' : '#D32F2F'} loading={loading} />
      </Box>

      {/* Charts */}
      {!loading && (
        <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
          {/* Pie chart */}
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 350 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Expense Breakdown by Category</Typography>
            {pieData.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No expense data</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>

          {/* Bar chart */}
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 350 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Income vs Expenses (Last 6 Months)</Typography>
            {!data?.monthly_series?.length ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No monthly data</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.monthly_series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <RTooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#388E3C" />
                  <Bar dataKey="expenses" name="Expenses" fill="#D32F2F" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Box>
      )}

      {/* Category breakdown table */}
      {!loading && categoryRows.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">Category Breakdown</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">This Period</TableCell>
                  <TableCell align="right">Previous Period</TableCell>
                  <TableCell align="right">Change %</TableCell>
                  <TableCell align="right">% of Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categoryRows.map(row => (
                  <TableRow key={row.category} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{getCategoryLabel(row.category)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(row.amount)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.prevAmount)}</TableCell>
                    <TableCell align="right" sx={{ color: row.change > 0 ? '#D32F2F' : row.change < 0 ? '#388E3C' : 'text.secondary' }}>
                      {row.change !== 0 ? `${row.change > 0 ? '+' : ''}${row.change.toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell align="right">{row.pctOfTotal.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Insights */}
      {!loading && data?.insights && (
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Insights</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.insights.highest_single_expense > 0 && (
              <Typography variant="body2">Highest single expense this period: <strong>{formatCurrency(data.insights.highest_single_expense)}</strong></Typography>
            )}
            {s.income_per_student > 0 && (
              <Typography variant="body2">Average income per student: <strong>{formatCurrency(s.income_per_student)}</strong></Typography>
            )}
            {data.insights.top_assignment && (
              <Typography variant="body2">
                Top staff assignment: <strong>{data.insights.top_assignment.staff_name} — {data.insights.top_assignment.title}</strong> ({formatCurrency(data.insights.top_assignment.total)})
              </Typography>
            )}
            {s.mom_change !== 0 && (
              <Typography variant="body2">
                Income trend: <strong style={{ color: s.mom_change >= 0 ? '#388E3C' : '#D32F2F' }}>{s.mom_change >= 0 ? 'Improving' : 'Declining'} ({momArrow}{Math.abs(s.mom_change)}%)</strong> compared to previous period
              </Typography>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
