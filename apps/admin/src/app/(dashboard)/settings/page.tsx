'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Divider,
  Switch,
  FormControlLabel,
} from '@neram/ui';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    siteName: 'Neram Classes',
    siteEmail: 'admin@neramclasses.com',
    contactPhone: '+91 1234567890',
    address: '123 Main Street, City, State - 123456',
    emailNotifications: true,
    smsNotifications: false,
    autoApprovePayments: false,
  });

  const handleSave = () => {
    console.log('Saving settings:', settings);
    // API call to save settings
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
        Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage application settings and preferences
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              General Settings
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Site Name"
                  fullWidth
                  value={settings.siteName}
                  onChange={(e) =>
                    setSettings({ ...settings, siteName: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Site Email"
                  type="email"
                  fullWidth
                  value={settings.siteEmail}
                  onChange={(e) =>
                    setSettings({ ...settings, siteEmail: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Contact Phone"
                  fullWidth
                  value={settings.contactPhone}
                  onChange={(e) =>
                    setSettings({ ...settings, contactPhone: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Address"
                  multiline
                  rows={3}
                  fullWidth
                  value={settings.address}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Notification Settings
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.emailNotifications}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        emailNotifications: e.target.checked,
                      })
                    }
                  />
                }
                label="Email Notifications"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.smsNotifications}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        smsNotifications: e.target.checked,
                      })
                    }
                  />
                }
                label="SMS Notifications"
              />
            </Box>
          </Paper>

          <Paper sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Application Settings
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoApprovePayments}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        autoApprovePayments: e.target.checked,
                      })
                    }
                  />
                }
                label="Auto-approve Payments"
              />
            </Box>
          </Paper>

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleSave}>
              Save Settings
            </Button>
            <Button variant="outlined">Reset</Button>
          </Box>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quick Info
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" color="text.secondary" paragraph>
              Settings are saved automatically and applied across the entire
              application.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Make sure to review all changes before saving.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
