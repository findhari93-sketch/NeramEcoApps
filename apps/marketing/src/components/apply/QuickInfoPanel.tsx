'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Fab,
  Drawer,
  IconButton,
  Divider,
  Chip,
  Button,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import {
  InfoOutlined,
  CloseOutlined,
  PhoneOutlined,
  SchoolOutlined,
  AccessTimeOutlined,
  CurrencyRupeeOutlined,
} from '@mui/icons-material';

interface FeeStructure {
  id: string;
  course_type: string;
  program_type: string;
  display_name: string;
  fee_amount: number;
  combo_extra_fee: number;
  duration: string;
  schedule_summary: string;
  features: string[];
}

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both NATA & JEE',
  revit: 'Revit Class',
};

interface QuickInfoPanelProps {
  hideFeesForScholarship?: boolean;
}

export default function QuickInfoPanel({ hideFeesForScholarship = false }: QuickInfoPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && feeStructures.length === 0) {
      setLoading(true);
      fetch('/api/fee-structures')
        .then((res) => res.json())
        .then((data) => setFeeStructures(data.feeStructures || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, feeStructures.length]);

  return (
    <>
      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="Course info & fees"
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          bottom: { xs: 16, md: 24 },
          right: { xs: 16, md: 24 },
          zIndex: 1000,
        }}
      >
        <InfoOutlined />
      </Fab>

      {/* Info Drawer */}
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: isMobile ? '100%' : 380,
            maxHeight: isMobile ? '85vh' : '100%',
            borderTopLeftRadius: isMobile ? 16 : 0,
            borderTopRightRadius: isMobile ? 16 : 0,
          },
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600}>
            Course Info & Fees
          </Typography>
          <IconButton onClick={() => setOpen(false)} size="small">
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />

        <Box sx={{ p: 2, overflowY: 'auto' }}>
          {/* Fee Structures */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CurrencyRupeeOutlined color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                Fee Structure
              </Typography>
            </Box>

            {hideFeesForScholarship ? (
              <Box
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: 'info.main',
                  borderRadius: 1,
                  bgcolor: 'info.50',
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  Government school students may be eligible for our scholarship program.
                  Fee details will be shared after verification. Contact us for more details.
                </Typography>
              </Box>
            ) : loading ? (
              <Box display="flex" justifyContent="center" py={3}>
                <CircularProgress size={24} />
              </Box>
            ) : feeStructures.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {feeStructures.map((fee) => (
                  <Box
                    key={fee.id}
                    sx={{
                      p: 2,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      bgcolor: 'grey.50',
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={600}>
                      {fee.display_name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mt: 0.5 }}>
                      <Typography variant="h5" fontWeight={700} color="primary">
                        ₹{fee.fee_amount.toLocaleString('en-IN')}
                      </Typography>
                      {fee.combo_extra_fee > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          (+₹{fee.combo_extra_fee.toLocaleString('en-IN')} for combo)
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        icon={<AccessTimeOutlined />}
                        label={fee.duration}
                        variant="outlined"
                      />
                      {fee.schedule_summary && (
                        <Chip
                          size="small"
                          icon={<SchoolOutlined />}
                          label={fee.schedule_summary}
                          variant="outlined"
                        />
                      )}
                    </Box>
                    {fee.features && fee.features.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        {fee.features.map((feature, i) => (
                          <Typography
                            key={i}
                            variant="caption"
                            color="text.secondary"
                            component="div"
                            sx={{ lineHeight: 1.8 }}
                          >
                            &#x2713; {feature}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Fee details will be shared during counseling. Contact us for more info.
              </Typography>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Contact Info */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <PhoneOutlined color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                Contact Us
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<PhoneOutlined />}
                href="tel:+919176137043"
                fullWidth
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                +91 91761 37043
              </Button>
              <Button
                variant="outlined"
                color="success"
                href="https://wa.me/919176137043?text=Hi%2C%20I%20have%20a%20question%20about%20Neram%20Classes"
                target="_blank"
                fullWidth
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                WhatsApp Us
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* About */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <SchoolOutlined color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                About Neram Classes
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" paragraph>
              Neram Classes is a premier coaching institute for architecture entrance exams
              (NATA & JEE Paper 2). We offer both year-long and crash course programs with
              experienced faculty and proven results.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Our hybrid learning model combines the best of online and offline classes,
              making quality education accessible from anywhere.
            </Typography>
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
