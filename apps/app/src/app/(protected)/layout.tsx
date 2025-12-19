'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Container,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import PhoneVerificationModal from '@/components/PhoneVerificationModal';

// Icons (using text fallbacks for now)
const MenuIcon = () => <span>☰</span>;
const DashboardIcon = () => <span>📊</span>;
const CalculatorIcon = () => <span>🔢</span>;
const SchoolIcon = () => <span>🏫</span>;
const LocationIcon = () => <span>📍</span>;
const FormIcon = () => <span>📝</span>;
const ProfileIcon = () => <span>👤</span>;

const menuItems = [
  { title: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
  { title: 'Cutoff Calculator', href: '/tools/cutoff-calculator', icon: <CalculatorIcon /> },
  { title: 'College Predictor', href: '/tools/college-predictor', icon: <SchoolIcon /> },
  { title: 'Exam Centers', href: '/tools/exam-centers', icon: <LocationIcon /> },
  { title: 'Apply Now', href: '/apply', icon: <FormIcon /> },
  { title: 'Profile', href: '/profile', icon: <ProfileIcon /> },
];

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useFirebaseAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    // Check if user has verified phone number
    if (user && user.phoneVerified) {
      setPhoneVerified(true);
    }
  }, [user]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleProfileMenuClose();
    await signOut();
    router.push('/');
  };

  const handlePhoneVerified = () => {
    setPhoneVerified(true);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  const drawer = (
    <Box sx={{ pt: 2 }}>
      <Box sx={{ px: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Neram Tools
        </Typography>
      </Box>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.href} disablePadding>
            <ListItemButton
              component={Link}
              href={item.href}
              selected={pathname === item.href}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.title} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Neram Classes
          </Typography>
          <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0 }}>
            <Avatar
              alt={user.name || 'User'}
              src={user.avatar || undefined}
              sx={{ width: 32, height: 32 }}
            />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem component={Link} href="/profile" onClick={handleProfileMenuClose}>
          Profile
        </MenuItem>
        <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
      </Menu>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better mobile performance
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
        }}
      >
        {drawer}
      </Drawer>

      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 240,
            mt: '64px',
          },
        }}
        open
      >
        {drawer}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - 240px)` },
          mt: '64px',
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
          {children}
        </Container>
      </Box>

      {/* Phone Verification Modal */}
      {!phoneVerified && (
        <PhoneVerificationModal
          open={!phoneVerified}
          onVerified={handlePhoneVerified}
        />
      )}
    </Box>
  );
}
