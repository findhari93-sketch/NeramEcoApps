'use client';

import {
  Box,
  Grid,
  Card,
  CardActionArea,
  Typography,
} from '@neram/ui';
import Link from 'next/link';
import Image from 'next/image';

interface AskSeniorsCollege {
  id: string;
  slug: string;
  state_slug: string;
  name: string;
  short_name: string;
  city: string;
  logo_url: string | null;
}

interface CollegesGridProps {
  colleges: AskSeniorsCollege[];
}

function getCollegeInitials(shortName: string): string {
  return shortName.slice(0, 3).toUpperCase();
}

export default function CollegesGrid({ colleges }: CollegesGridProps) {
  return (
    <Box
      component="section"
      id="colleges"
      sx={{
        py: { xs: 6, md: 9 },
        px: { xs: 2, md: 4 },
        maxWidth: 1100,
        mx: 'auto',
      }}
    >
      {/* Overline label */}
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: '#e8a020',
          letterSpacing: 3,
          fontWeight: 700,
          mb: 2,
        }}
      >
        PARTICIPATING COLLEGES
      </Typography>

      {/* Heading */}
      <Typography
        component="h3"
        variant="h4"
        sx={{
          fontWeight: 800,
          color: '#fff',
          mb: 5,
        }}
      >
        {colleges.length}+ Architecture Colleges
      </Typography>

      {/* Grid */}
      <Grid container spacing={2}>
        {colleges.map((college) => (
          <Grid
            item
            xs={6}
            sm={4}
            md={3}
            key={college.id}
          >
            <Card
              component={Link}
              href={`/colleges/${college.state_slug}/${college.slug}`}
              sx={{
                bgcolor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 2,
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                height: '100%',
                '&:hover': {
                  borderColor: 'rgba(232,160,32,0.5)',
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <CardActionArea
                sx={{
                  p: 2,
                  textAlign: 'center',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Logo Avatar */}
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 1.5,
                    overflow: 'hidden',
                  }}
                >
                  {college.logo_url ? (
                    <Image
                      src={college.logo_url}
                      alt={college.name}
                      width={50}
                      height={50}
                      style={{
                        objectFit: 'contain',
                        padding: '4px',
                      }}
                      unoptimized
                    />
                  ) : (
                    <Typography
                      sx={{
                        fontWeight: 600,
                        color: '#000',
                        fontSize: '0.875rem',
                      }}
                    >
                      {getCollegeInitials(college.short_name)}
                    </Typography>
                  )}
                </Box>

                {/* College Name */}
                <Typography
                  sx={{
                    fontWeight: 600,
                    color: '#e5e7eb',
                    fontSize: 13,
                    lineHeight: 1.3,
                    mb: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {college.name}
                </Typography>

                {/* City */}
                <Typography
                  variant="caption"
                  sx={{
                    color: '#6b7280',
                  }}
                >
                  {college.city}
                </Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
