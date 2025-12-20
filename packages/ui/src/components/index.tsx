/**
 * Neram Classes - Shared UI Components
 * 
 * Re-exports commonly used MUI components with Neram customizations
 */

'use client';

// Re-export all MUI components (for convenience)
export {
  // Layout
  Box,
  Container,
  Grid,
  Stack,
  Paper,
  Card,
  CardContent,
  CardHeader,
  CardActions,
  CardMedia,
  Divider,
  
  // Navigation
  AppBar,
  Toolbar,
  Drawer,
  SwipeableDrawer,
  Menu,
  MenuItem,
  MenuList,
  BottomNavigation,
  BottomNavigationAction,
  Breadcrumbs,
  Link,
  Tabs,
  Tab,
  Pagination,
  
  // Inputs
  Button,
  IconButton,
  ButtonGroup,
  Fab,
  TextField,
  Select,
  Checkbox,
  Radio,
  RadioGroup,
  Switch,
  Slider,
  Autocomplete,
  FormControl,
  FormControlLabel,
  FormLabel,
  FormGroup,
  FormHelperText,
  InputLabel,
  Input,
  InputBase,
  InputAdornment,
  OutlinedInput,
  FilledInput,
  
  // Data Display
  Avatar,
  AvatarGroup,
  Badge,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  ListSubheader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  TableFooter,
  Typography,
  Tooltip,
  
  // Feedback
  Alert,
  AlertTitle,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Snackbar,
  Backdrop,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  
  // Surfaces
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AccordionActions,

  // Stepper
  Stepper,
  Step,
  StepLabel,
  StepButton,
  StepContent,
  StepConnector,
  StepIcon,
  MobileStepper,

  // Utils
  ClickAwayListener,
  Collapse,
  Fade,
  Grow,
  Slide,
  Zoom,
  Modal,
  Popover,
  Popper,
  Portal,
  
  // Icons (commonly used)
} from '@mui/material';

// Export icon components (commonly used) - using default imports for Next.js compatibility
export { default as MenuIcon } from '@mui/icons-material/Menu';
export { default as CloseIcon } from '@mui/icons-material/Close';
export { default as SearchIcon } from '@mui/icons-material/Search';
export { default as PersonIcon } from '@mui/icons-material/Person';
export { default as SettingsIcon } from '@mui/icons-material/Settings';
export { default as HomeIcon } from '@mui/icons-material/Home';
export { default as ArrowBackIcon } from '@mui/icons-material/ArrowBack';
export { default as ArrowForwardIcon } from '@mui/icons-material/ArrowForward';
export { default as KeyboardArrowDownIcon } from '@mui/icons-material/KeyboardArrowDown';
export { default as KeyboardArrowUpIcon } from '@mui/icons-material/KeyboardArrowUp';
export { default as KeyboardArrowLeftIcon } from '@mui/icons-material/KeyboardArrowLeft';
export { default as KeyboardArrowRightIcon } from '@mui/icons-material/KeyboardArrowRight';
export { default as CheckIcon } from '@mui/icons-material/Check';
export { default as AddIcon } from '@mui/icons-material/Add';
export { default as RemoveIcon } from '@mui/icons-material/Remove';
export { default as EditIcon } from '@mui/icons-material/Edit';
export { default as DeleteIcon } from '@mui/icons-material/Delete';
export { default as MoreVertIcon } from '@mui/icons-material/MoreVert';
export { default as MoreHorizIcon } from '@mui/icons-material/MoreHoriz';
export { default as VisibilityIcon } from '@mui/icons-material/Visibility';
export { default as VisibilityOffIcon } from '@mui/icons-material/VisibilityOff';
export { default as EmailIcon } from '@mui/icons-material/Email';
export { default as PhoneIcon } from '@mui/icons-material/Phone';
export { default as LocationOnIcon } from '@mui/icons-material/LocationOn';
export { default as CalendarTodayIcon } from '@mui/icons-material/CalendarToday';
export { default as AccessTimeIcon } from '@mui/icons-material/AccessTime';
export { default as StarIcon } from '@mui/icons-material/Star';
export { default as StarBorderIcon } from '@mui/icons-material/StarBorder';
export { default as FavoriteIcon } from '@mui/icons-material/Favorite';
export { default as FavoriteBorderIcon } from '@mui/icons-material/FavoriteBorder';
export { default as ShareIcon } from '@mui/icons-material/Share';
export { default as DownloadIcon } from '@mui/icons-material/Download';
export { default as UploadIcon } from '@mui/icons-material/Upload';
export { default as RefreshIcon } from '@mui/icons-material/Refresh';
export { default as FilterListIcon } from '@mui/icons-material/FilterList';
export { default as SortIcon } from '@mui/icons-material/Sort';
export { default as ExpandMoreIcon } from '@mui/icons-material/ExpandMore';
export { default as ExpandLessIcon } from '@mui/icons-material/ExpandLess';
export { default as ChevronLeftIcon } from '@mui/icons-material/ChevronLeft';
export { default as ChevronRightIcon } from '@mui/icons-material/ChevronRight';
export { default as InfoIcon } from '@mui/icons-material/Info';
export { default as WarningIcon } from '@mui/icons-material/Warning';
export { default as ErrorIcon } from '@mui/icons-material/Error';
export { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle';
export { default as CancelIcon } from '@mui/icons-material/Cancel';
export { default as HelpIcon } from '@mui/icons-material/Help';
export { default as NotificationsIcon } from '@mui/icons-material/Notifications';
export { default as NotificationsNoneIcon } from '@mui/icons-material/NotificationsNone';
export { default as DashboardIcon } from '@mui/icons-material/Dashboard';
export { default as SchoolIcon } from '@mui/icons-material/School';
export { default as AssignmentIcon } from '@mui/icons-material/Assignment';
export { default as BookIcon } from '@mui/icons-material/Book';
export { default as PlayArrowIcon } from '@mui/icons-material/PlayArrow';
export { default as PauseIcon } from '@mui/icons-material/Pause';
export { default as StopIcon } from '@mui/icons-material/Stop';
export { default as VolumeUpIcon } from '@mui/icons-material/VolumeUp';
export { default as VolumeOffIcon } from '@mui/icons-material/VolumeOff';
export { default as FullscreenIcon } from '@mui/icons-material/Fullscreen';
export { default as FullscreenExitIcon } from '@mui/icons-material/FullscreenExit';
export { default as LanguageIcon } from '@mui/icons-material/Language';
export { default as TranslateIcon } from '@mui/icons-material/Translate';
export { default as LightModeIcon } from '@mui/icons-material/LightMode';
export { default as DarkModeIcon } from '@mui/icons-material/DarkMode';
export { default as GoogleIcon } from '@mui/icons-material/Google';
export { default as FacebookIcon } from '@mui/icons-material/Facebook';
export { default as TwitterIcon } from '@mui/icons-material/Twitter';
export { default as LinkedInIcon } from '@mui/icons-material/LinkedIn';
export { default as YouTubeIcon } from '@mui/icons-material/YouTube';
export { default as InstagramIcon } from '@mui/icons-material/Instagram';
export { default as WhatsAppIcon } from '@mui/icons-material/WhatsApp';

// ============================================
// CUSTOM COMPONENTS
// ============================================

export { default as LoadingButton } from '@mui/lab/LoadingButton';

// ============================================
// NERAM CUSTOM COMPONENTS
// ============================================

import React from 'react';
import { Box, CircularProgress, Typography, Stack } from '@mui/material';
import { primaryColors } from '../theme/tokens';

/**
 * Full page loading spinner
 */
export interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = 'Loading...' }: PageLoaderProps): JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress size={48} thickness={3} />
      <Typography color="text.secondary" variant="body2">
        {message}
      </Typography>
    </Box>
  );
}

/**
 * Section loading spinner
 */
export interface SectionLoaderProps {
  height?: number | string;
  message?: string;
}

export function SectionLoader({ 
  height = 200, 
  message 
}: SectionLoaderProps): JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        gap: 2,
      }}
    >
      <CircularProgress size={32} thickness={3} />
      {message && (
        <Typography color="text.secondary" variant="caption">
          {message}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Logo component
 */
export interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  variant?: 'full' | 'icon';
  color?: 'primary' | 'white' | 'inherit';
}

export function Logo({ 
  size = 'medium', 
  variant = 'full',
  color = 'primary' 
}: LogoProps): JSX.Element {
  const sizes = {
    small: { height: 28, fontSize: '1rem' },
    medium: { height: 36, fontSize: '1.25rem' },
    large: { height: 48, fontSize: '1.5rem' },
  };

  const colors = {
    primary: primaryColors[500],
    white: '#FFFFFF',
    inherit: 'inherit',
  };

  const { height, fontSize } = sizes[size];
  const textColor = colors[color];

  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      {/* Logo Icon - Replace with actual logo */}
      <Box
        sx={{
          width: height,
          height: height,
          borderRadius: 1,
          background: color === 'white' 
            ? 'rgba(255,255,255,0.2)' 
            : `linear-gradient(135deg, ${primaryColors[500]} 0%, ${primaryColors[700]} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color === 'white' ? 'white' : '#FFFFFF',
          fontWeight: 700,
          fontSize: fontSize,
        }}
      >
        N
      </Box>
      {variant === 'full' && (
        <Typography
          sx={{
            fontFamily: '"Poppins", sans-serif',
            fontWeight: 700,
            fontSize: fontSize,
            color: textColor,
            letterSpacing: '-0.02em',
          }}
        >
          Neram
          <Box component="span" sx={{ fontWeight: 400 }}>Classes</Box>
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Gradient text component
 */
export interface GradientTextProps {
  children: React.ReactNode;
  gradient?: 'primary' | 'secondary' | 'accent';
  component?: React.ElementType;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function GradientText({ 
  children, 
  gradient = 'primary',
  component = 'span',
  variant,
}: GradientTextProps): JSX.Element {
  const gradients = {
    primary: `linear-gradient(135deg, ${primaryColors[500]} 0%, ${primaryColors[700]} 100%)`,
    secondary: `linear-gradient(135deg, ${primaryColors[500]} 0%, ${primaryColors[700]} 50%, rgba(21, 101, 192, 0.8) 100%)`,
    accent: `linear-gradient(135deg, ${primaryColors[700]} 0%, ${primaryColors[500]} 50%, ${primaryColors[700]} 100%)`,
  };

  return (
    <Typography
      component={component}
      variant={variant}
      sx={{
        background: gradients[gradient],
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * Empty state component
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ 
  title, 
  description, 
  icon, 
  action 
}: EmptyStateProps): JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 3,
        textAlign: 'center',
      }}
    >
      {icon && (
        <Box
          sx={{
            mb: 2,
            color: 'text.secondary',
            '& svg': { fontSize: 64 },
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography 
          color="text.secondary" 
          variant="body2" 
          sx={{ maxWidth: 400, mb: action ? 3 : 0 }}
        >
          {description}
        </Typography>
      )}
      {action}
    </Box>
  );
}

// ============================================
// APPLICATION FORM COMPONENTS
// ============================================

// Document Upload Component
export { DocumentUpload } from './DocumentUpload';
export type { DocumentUploadProps } from './DocumentUpload';

// Chat Widget Component
export { ChatWidget } from './ChatWidget';
export type {
  ChatWidgetProps,
  ChatMessage,
  ChatStep,
  ChatFlowConfig,
  ChatInputConfig,
} from './ChatWidget';
export { applicationFormFlow } from './ChatWidget/applicationFlow';

/**
 * Status badge component
 */
export type StatusType = 'pending' | 'approved' | 'rejected' | 'active' | 'inactive' | 'completed';

export interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps): JSX.Element {
  const statusConfig: Record<StatusType, { color: string; bg: string; label: string }> = {
    pending: { color: '#F57F17', bg: 'rgba(245, 127, 23, 0.12)', label: 'Pending' },
    approved: { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.12)', label: 'Approved' },
    rejected: { color: '#C62828', bg: 'rgba(198, 40, 40, 0.12)', label: 'Rejected' },
    active: { color: '#1565C0', bg: 'rgba(21, 101, 192, 0.12)', label: 'Active' },
    inactive: { color: '#757575', bg: 'rgba(117, 117, 117, 0.12)', label: 'Inactive' },
    completed: { color: '#00897B', bg: 'rgba(0, 137, 123, 0.12)', label: 'Completed' },
  };

  const config = statusConfig[status];

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      <Box
        component="span"
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: config.color,
          mr: 1,
        }}
      />
      {label || config.label}
    </Box>
  );
}
