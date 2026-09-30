import { useMemo, useState } from 'react';
import { Outlet, useNavigate, NavLink as RouterNavLink } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Toolbar, Tooltip, Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ApartmentIcon from '@mui/icons-material/Apartment';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import GroupIcon from '@mui/icons-material/Group';
import TuneIcon from '@mui/icons-material/Tune';
import EventIcon from '@mui/icons-material/Event';
import DomainIcon from '@mui/icons-material/Domain';
import SecurityIcon from '@mui/icons-material/Security';
import type { ComponentType } from 'react';
import { NAV_ITEMS, roleHas, type Permission } from '@propflow/shared';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { toggleMode } from '../app/slices/uiSlice';
import { useLogoutMutation } from '../app/api/authApi';
import { authCleared } from '../app/slices/authSlice';

const DRAWER_WIDTH = 240;

/* Icon lookup kept as an explicit map so the icons barrel stays tree-shakeable. */
const NAV_ICONS: Record<string, ComponentType> = {
  dashboard: DashboardIcon,
  apartment: ApartmentIcon,
  home_work: HomeWorkIcon,
  event: EventIcon,
  group: GroupIcon,
  tune: TuneIcon,
  domain: DomainIcon,
  security: SecurityIcon,
};

export default function AppLayout() {
  const user = useAppSelector((s) => s.auth.user);
  const mode = useAppSelector((s) => s.ui.mode);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [logout] = useLogoutMutation();

  const navItems = useMemo(() => {
    if (!user) return [];
    return NAV_ITEMS.filter((item) => {
      if (item.superAdminOnly && user.role !== 'SUPER_ADMIN') return false;
      if (!item.permission) return true;
      return roleHas(user.role, item.permission as Permission);
    });
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout(undefined).unwrap();
    } finally {
      dispatch(authCleared());
      navigate('/login');
    }
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" fontWeight={800} color="primary">
          PropFlow
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {navItems.map((item) => {
          const Icon = NAV_ICONS[item.icon] ?? DashboardIcon;
          return (
            <ListItemButton
              key={item.path}
              component={RouterNavLink}
              to={item.path}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon>
                <Icon />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { md: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Toggle theme">
            <IconButton onClick={() => dispatch(toggleMode())}>
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
              {user?.name?.slice(0, 2).toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>
              {user?.name} · {user?.role}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        {drawer}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' },
        }}
        open
      >
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, md: 3 }, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
