'use client';

import { useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Typography,
  Button,
  Box,
  Chip,
} from '@neram/ui';
import { Link } from '@neram/ui';
import { type Locale } from '@/i18n';

interface Course {
  id: number;
  slug: string;
  title: string;
  description: string;
  duration: string;
  level: string;
  category?: string;
  image: string;
  features?: string[];
}

interface CourseCardProps {
  course: Course;
}

export default function CourseCard({ course }: CourseCardProps) {
  const params = useParams();
  const locale = params.locale as Locale;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'rgba(11,22,41,0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          transform: 'translateY(-8px)',
          boxShadow: '0 12px 40px rgba(232,160,32,0.15)',
          borderColor: 'rgba(232,160,32,0.25)',
        },
      }}
    >
      {/* Course Image */}
      <CardMedia
        component="div"
        sx={{
          height: 200,
          bgcolor: 'rgba(11,22,41,0.9)',
          position: 'relative',
          overflow: 'hidden',
          backgroundImage: `linear-gradient(to top, rgba(11,22,41,0.6) 0%, transparent 50%), url(${course.image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Level Badge */}
        <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
          <Chip
            label={course.level}
            size="small"
            sx={{
              bgcolor: 'rgba(6,13,31,0.8)',
              color: '#e8a020',
              fontWeight: 600,
              border: '1px solid rgba(232,160,32,0.3)',
              backdropFilter: 'blur(8px)',
            }}
          />
        </Box>
      </CardMedia>

      {/* Course Content */}
      <CardContent sx={{ flexGrow: 1, p: 3 }}>
        {/* Category */}
        {course.category && (
          <Typography
            variant="caption"
            color="primary"
            sx={{ fontWeight: 600, textTransform: 'uppercase', mb: 1, display: 'block' }}
          >
            {course.category}
          </Typography>
        )}

        {/* Title */}
        <Typography
          variant="h5"
          component="h3"
          gutterBottom
          sx={{ fontWeight: 700, mb: 2 }}
        >
          {course.title}
        </Typography>

        {/* Description */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {course.description}
        </Typography>

        {/* Course Info */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Duration
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {course.duration}
            </Typography>
          </Box>
        </Box>

        {/* Features (if available) */}
        {course.features && course.features.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Key Features:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
              {course.features.slice(0, 3).map((feature, index) => (
                <Chip key={index} label={feature} size="small" variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'text.secondary' }} />
              ))}
            </Box>
          </Box>
        )}
      </CardContent>

      {/* Card Actions */}
      <CardActions sx={{ p: 3, pt: 0 }}>
        <Button
          variant="outlined"
          fullWidth
          component={Link}
          href={`/${locale}/courses/${course.slug}`}
          sx={{
            py: 1.2,
            borderColor: 'rgba(232,160,32,0.4)',
            color: '#e8a020',
            '&:hover': {
              bgcolor: 'rgba(232,160,32,0.1)',
              borderColor: '#e8a020',
            },
          }}
        >
          Learn More
        </Button>
      </CardActions>
    </Card>
  );
}
