'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  UserAvatar,
  Tooltip,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Divider,
} from '@neram/ui';
import { useBatches } from '@/contexts/BatchContext';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import PeopleIcon from '@mui/icons-material/People';
import PaymentIcon from '@mui/icons-material/Payment';
import BookIcon from '@mui/icons-material/Book';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import VideocamIcon from '@mui/icons-material/Videocam';
import QuizIcon from '@mui/icons-material/Quiz';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import SchoolIcon from '@mui/icons-material/School';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import CampaignIcon from '@mui/icons-material/Campaign';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import RateReviewIcon from '@mui/icons-material/RateReview';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ForumIcon from '@mui/icons-material/Forum';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GavelIcon from '@mui/icons-material/Gavel';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import WorkIcon from '@mui/icons-material/Work';
import FeedbackIcon from '@mui/icons-material/Feedback';
import DomainIcon from '@mui/icons-material/Domain';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import WindowIcon from '@mui/icons-material/Window';
import CommentIcon from '@mui/icons-material/Comment';
import TourIcon from '@mui/icons-material/Tour';
import HandshakeIcon from '@mui/icons-material/Handshake';
import DevicesIcon from '@mui/icons-material/Devices';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import PhoneCallbackIcon from '@mui/icons-material/PhoneCallback';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { useMicrosoftAuth } from '@neram/auth';
import NotificationBell from './NotificationBell';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAdminBadges } from '@/contexts/AdminBadgesContext';

const TRANSITION = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
const MOBILE_DRAWER_WIDTH = 280;

type BadgeKey =
  | 'careers'
  | 'leads'
  | 'students'
  | 'demo_classes'
  | 'support_tickets'
  | 'app_feedback'
  | 'qa_moderation'
  | 'payments'
  | 'chat_history'
  | 'duplicates'
  | 'follow_ups'
  | 'lifecycle';

interface MenuItem {
  text: string;
  icon: typeof DashboardIcon;
  path: string;
  hasBadge?: true | BadgeKey;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: 'Overview',
    items: [
      { text: 'Dashboard', icon: DashboardIcon, path: '/' },
    ],
  },
  {
    label: 'People & CRM',
    items: [
      { text: 'Users (CRM)', icon: PeopleIcon, path: '/crm' },
      { text: 'Follow-ups', icon: PhoneCallbackIcon, path: '/follow-ups', hasBadge: 'follow_ups' },
      { text: 'Duplicates', icon: MergeTypeIcon, path: '/duplicates', hasBadge: 'duplicates' },
      { text: 'Lifecycle', icon: AutorenewIcon, path: '/lifecycle', hasBadge: 'lifecycle' },
      { text: 'Exam Batches', icon: CalendarMonthIcon, path: '/exam-batches' },
      { text: 'Leads', icon: PersonSearchIcon, path: '/leads', hasBadge: 'leads' },
      { text: 'Students', icon: SchoolIcon, path: '/students', hasBadge: 'students' },
      { text: 'Student Devices', icon: DevicesIcon, path: '/devices' },
      { text: 'Direct Enroll', icon: PersonAddAlt1Icon, path: '/direct-enrollment' },
      { text: 'Student Onboarding', icon: AssignmentTurnedInIcon, path: '/student-onboarding' },
      { text: 'Demo Classes', icon: VideocamIcon, path: '/demo-classes', hasBadge: 'demo_classes' },
      { text: 'AskSeniors', icon: EmojiEventsIcon, path: '/ask-seniors' },
      { text: 'Alumni', icon: HistoryEduIcon, path: '/alumni' },
      { text: 'Software course', icon: LaptopMacIcon, path: '/software' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { text: 'Courses', icon: BookIcon, path: '/courses' },
      { text: 'Onboarding', icon: QuizIcon, path: '/onboarding' },
      { text: 'NATA Content', icon: ArchitectureIcon, path: '/nata' },
      { text: 'Counseling', icon: GavelIcon, path: '/counseling' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { text: 'Payments', icon: PaymentIcon, path: '/payments', hasBadge: 'payments' },
      { text: 'Fee Structures', icon: AttachMoneyIcon, path: '/fee-structures' },
      { text: 'Expenses', icon: ReceiptLongIcon, path: '/expenses' },
      { text: 'Staff Assignments', icon: BusinessCenterIcon, path: '/staff-assignments' },
      { text: 'Financial Dashboard', icon: AnalyticsIcon, path: '/financial-dashboard' },
    ],
  },
  {
    label: 'Exams',
    items: [
      { text: 'Exam Centers', icon: LocationOnIcon, path: '/exam-centers' },
      { text: 'Exam Schedule', icon: EventNoteIcon, path: '/exam-schedule' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { text: 'Messages', icon: MailOutlinedIcon, path: '/messages', hasBadge: true },
      { text: 'Support Tickets', icon: SupportAgentIcon, path: '/support-tickets', hasBadge: 'support_tickets' },
      { text: 'App Feedback', icon: FeedbackIcon, path: '/feedback', hasBadge: 'app_feedback' },
      { text: 'WhatsApp Templates', icon: WhatsAppIcon, path: '/whatsapp-templates' },
      { text: 'Q&A Moderation', icon: RateReviewIcon, path: '/question-moderation', hasBadge: 'qa_moderation' },
      { text: 'Chat History', icon: ForumIcon, path: '/chat-history', hasBadge: 'chat_history' },
      { text: 'Aintra Training', icon: SmartToyIcon, path: '/aintra-kb' },
      { text: 'Training Guide', icon: MenuBookIcon, path: '/aintra-guide' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { text: 'Marketing Content', icon: CampaignIcon, path: '/marketing-content' },
      { text: 'Testimonials', icon: FormatQuoteIcon, path: '/testimonials' },
      { text: 'Social Proofs', icon: GraphicEqIcon, path: '/social-proofs' },
      { text: 'Careers', icon: WorkIcon, path: '/careers', hasBadge: 'careers' },
    ],
  },
  {
    label: 'College Hub',
    items: [
      { text: 'Overview', icon: DomainIcon, path: '/college-hub' },
      { text: 'Colleges', icon: LeaderboardIcon, path: '/college-hub/colleges' },
      { text: 'Review Queue', icon: StarHalfIcon, path: '/college-hub/reviews' },
      { text: 'Leads', icon: PeopleIcon, path: '/college-hub/leads' },
      { text: 'College Accounts', icon: ManageAccountsIcon, path: '/college-hub/accounts' },
      { text: 'Lead Windows', icon: WindowIcon, path: '/college-hub/lead-windows' },
      { text: 'Comments', icon: CommentIcon, path: '/college-hub/comments' },
      { text: 'Virtual Tour', icon: TourIcon, path: '/college-hub/virtual-tour' },
      { text: 'Partnership Pages', icon: HandshakeIcon, path: '/college-hub/partnership' },
      { text: 'Tier Management', icon: EmojiEventsIcon, path: '/college-hub/tiers' },
      { text: 'Outreach', icon: MarkEmailReadIcon, path: '/college-outreach' },
      { text: 'Leads Review', icon: PeopleIcon, path: '/college-leads' },
    ],
  },
  {
    label: 'System',
    items: [
      { text: 'Settings', icon: SettingsIcon, path: '/settings' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useMicrosoftAuth();
  const { collapsed, toggleSidebar, sidebarWidth, isMobile, mobileOpen, setMobileOpen } = useSidebar();
  // Global exam-batch switch lives in this profile menu; every user-list follows it.
  const { current: currentBatch, batches, selectedBatch, setSelectedBatch } = useBatches();
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  // One shared poller (AdminBadgesProvider) feeds every badge here and the bell.
  const { counts: badgeCounts } = useAdminBadges();
  const messageUnreadCount = badgeCounts.messages_unread;

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  const renderIcon = (item: MenuItem) => {
    const Icon = item.icon;
    const iconEl = <Icon sx={{ fontSize: 18 }} />;

    if (item.hasBadge === true && messageUnreadCount > 0) {
      return <Badge badgeContent={messageUnreadCount} color="error" max={99}>{iconEl}</Badge>;
    }
    if (typeof item.hasBadge === 'string') {
      const count = badgeCounts[item.hasBadge as BadgeKey] ?? 0;
      if (count > 0) {
        return <Badge badgeContent={count} color="error" max={99}>{iconEl}</Badge>;
      }
    }
    return iconEl;
  };

  const showCollapsed = !isMobile && collapsed;

  const drawerContent = (
    <>
      {/* Header — brand + bell + collapse toggle */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: showCollapsed ? 'center' : 'space-between',
          px: showCollapsed ? 0.5 : 2,
          py: 1.5,
          minHeight: 48,
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: TRANSITION,
        }}
      >
        {!showCollapsed ? (
          <>
            <Typography
              variant="body2"
              component="h1"
              fontWeight={700}
              noWrap
              sx={{ fontSize: 14, color: 'text.primary' }}
            >
              Neram Classes
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <NotificationBell />
              {!isMobile && (
                <IconButton
                  onClick={toggleSidebar}
                  size="small"
                  sx={{ width: 24, height: 24, color: 'text.secondary' }}
                >
                  <ChevronLeftIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
          </>
        ) : (
          <IconButton
            onClick={toggleSidebar}
            size="small"
            sx={{ width: 28, height: 28, color: 'text.secondary' }}
          >
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>

      {/* Grouped navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
        {menuGroups.map((group) => (
          <Box key={group.label} sx={{ mb: 0.5 }}>
            {/* Section label — hidden when collapsed */}
            {!showCollapsed && (
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#9CA3AF',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  px: 2,
                  pt: 1.5,
                  pb: 0.5,
                  userSelect: 'none',
                }}
              >
                {group.label}
              </Typography>
            )}
            <List disablePadding sx={{ px: showCollapsed ? 0.5 : 0.75 }}>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.path ||
                  (item.path !== '/' && pathname.startsWith(item.path));

                const handleNavClick = () => {
                  router.push(item.path);
                  if (isMobile) setMobileOpen(false);
                };

                const button = (
                  <ListItemButton
                    onClick={handleNavClick}
                    selected={isActive}
                    sx={{
                      borderRadius: 1.5,
                      justifyContent: showCollapsed ? 'center' : 'flex-start',
                      px: showCollapsed ? 1 : 1.5,
                      py: 0.5,
                      minHeight: isMobile ? 44 : 34,
                      transition: TRANSITION,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: showCollapsed ? 'auto' : 32,
                        justifyContent: 'center',
                      }}
                    >
                      {renderIcon(item)}
                    </ListItemIcon>
                    {!showCollapsed && (
                      <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      />
                    )}
                  </ListItemButton>
                );

                return (
                  <ListItem key={item.text} disablePadding sx={{ mb: '1px' }}>
                    {showCollapsed ? (
                      <Tooltip title={item.text} placement="right" arrow>
                        {button}
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* User row at bottom */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: showCollapsed ? 'center' : 'space-between',
          px: showCollapsed ? 0.5 : 2,
          py: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          minHeight: 44,
          transition: TRANSITION,
        }}
      >
        {!showCollapsed ? (
          <Box
            onClick={(e) => setProfileAnchor(e.currentTarget)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1,
              cursor: 'pointer', borderRadius: 1, p: 0.5,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <UserAvatar name={user?.name || 'Admin'} size={28} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} noWrap sx={{ display: 'block', color: 'text.primary', lineHeight: 1.2 }}>
                {user?.name || 'Admin'}
              </Typography>
              <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', fontSize: 10, lineHeight: 1.2 }}>
                Batch: {selectedBatch === 'current' ? (currentBatch?.code || 'current') : selectedBatch === 'all' ? 'All' : selectedBatch}
              </Typography>
            </Box>
            <ArrowDropUpIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
          </Box>
        ) : (
          <Tooltip title={`${user?.name || 'Admin'} — menu`} placement="right" arrow>
            <IconButton onClick={(e) => setProfileAnchor(e.currentTarget)} size="small" sx={{ width: 32, height: 32 }}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 12,
                  bgcolor: '#E5E7EB',
                  color: '#374151',
                }}
              >
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ sx: { minWidth: 250 } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap>{user?.name || 'Admin'}</Typography>
          {user?.email && <Typography variant="caption" color="text.secondary" noWrap>{user.email}</Typography>}
        </Box>
        <Divider />
        <Typography variant="caption" sx={{ px: 2, pt: 1, pb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 700 }}>
          <CalendarMonthIcon sx={{ fontSize: 13, verticalAlign: 'middle', mr: 0.5 }} />
          Exam Batch (applies everywhere)
        </Typography>
        <MenuItem
          selected={selectedBatch === 'current'}
          onClick={() => { setSelectedBatch('current'); setProfileAnchor(null); }}
        >
          Current{currentBatch?.code ? ` (${currentBatch.code})` : ''}
        </MenuItem>
        {batches.map((b) => (
          <MenuItem
            key={b.code}
            selected={selectedBatch === b.code}
            onClick={() => { setSelectedBatch(b.code); setProfileAnchor(null); }}
          >
            {b.code}{b.status === 'closed' ? ' (closed)' : ''}
          </MenuItem>
        ))}
        <MenuItem
          selected={selectedBatch === 'all'}
          onClick={() => { setSelectedBatch('all'); setProfileAnchor(null); }}
        >
          All batches
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setProfileAnchor(null); handleLogout(); }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: MOBILE_DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: sidebarWidth,
        flexShrink: 0,
        transition: TRANSITION,
        '& .MuiDrawer-paper': {
          width: sidebarWidth,
          boxSizing: 'border-box',
          transition: TRANSITION,
          overflowX: 'hidden',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
