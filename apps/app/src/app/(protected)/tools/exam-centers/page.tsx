'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@neram/ui';

interface ExamCenter {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  distance?: string;
}

export default function ExamCentersPage() {
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [centers, setCenters] = useState<ExamCenter[]>([]);

  const states = [
    'Delhi',
    'Maharashtra',
    'Karnataka',
    'Tamil Nadu',
    'West Bengal',
    'Telangana',
    'Gujarat',
    'Rajasthan',
  ];

  const cities: Record<string, string[]> = {
    Delhi: ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi'],
    Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
    Karnataka: ['Bangalore', 'Mysore', 'Mangalore', 'Hubli'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Trichy'],
  };

  const searchCenters = () => {
    // Mock data - replace with actual API call
    const mockCenters: ExamCenter[] = [
      {
        name: 'Delhi Public School',
        address: 'Mathura Road, East of Kailash',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110065',
        distance: '2.5 km',
      },
      {
        name: 'Modern School',
        address: 'Barakhamba Road',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        distance: '5.2 km',
      },
      {
        name: 'Amity International School',
        address: 'Sector 46, Noida',
        city: 'Noida',
        state: 'Delhi',
        pincode: '201301',
        distance: '15.8 km',
      },
      {
        name: 'Ryan International School',
        address: 'Vasant Kunj',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110070',
        distance: '8.3 km',
      },
    ];

    setCenters(mockCenters);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        NATA Exam Centers
      </Typography>

      <Grid container spacing={3}>
        {/* Search Section */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Find Exam Centers
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select State</InputLabel>
              <Select
                value={selectedState}
                label="Select State"
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedCity('');
                }}
              >
                <MenuItem value="">All States</MenuItem>
                {states.map((state) => (
                  <MenuItem key={state} value={state}>
                    {state}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedState}>
              <InputLabel>Select City</InputLabel>
              <Select
                value={selectedCity}
                label="Select City"
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <MenuItem value="">All Cities</MenuItem>
                {selectedState &&
                  cities[selectedState]?.map((city) => (
                    <MenuItem key={city} value={city}>
                      {city}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Search by name or pincode"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter center name or pincode"
              sx={{ mb: 3 }}
            />

            <Button variant="contained" fullWidth size="large" onClick={searchCenters}>
              Search Centers
            </Button>
          </Paper>

          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Quick Tips
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Visit the exam center before the exam day
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Check traffic conditions and plan your route
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Arrive at least 30 minutes before reporting time
            </Typography>
          </Paper>
        </Grid>

        {/* Results Section */}
        <Grid item xs={12} md={8}>
          {centers.length > 0 ? (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Exam Centers ({centers.length})
              </Typography>
              <Grid container spacing={2}>
                {centers.map((center, index) => (
                  <Grid item xs={12} key={index}>
                    <Card>
                      <CardContent>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            mb: 1,
                          }}
                        >
                          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                            {center.name}
                          </Typography>
                          {center.distance && (
                            <Chip label={center.distance} size="small" color="primary" />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {center.address}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                          <Chip label={center.city} size="small" variant="outlined" />
                          <Chip label={center.state} size="small" variant="outlined" />
                          <Chip label={center.pincode} size="small" variant="outlined" />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button size="small" variant="outlined">
                            Get Directions
                          </Button>
                          <Button size="small" variant="text">
                            View Details
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : (
            <Paper
              sx={{
                p: { xs: 2, md: 3 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Select your location
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose state and city to find NATA exam centers near you
                </Typography>
              </Box>
            </Paper>
          )}
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Important Information
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Exam centers are allocated based on your preference during registration. You can
              select up to 3 preferred cities.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              The final exam center will be mentioned on your admit card. Make sure to verify the
              location before the exam day.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contact COA helpdesk for any queries regarding exam center allocation.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
