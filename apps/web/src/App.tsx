import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { installTokenBridge } from './app/slices/authSlice';
import { resetRefreshFlight } from './app/baseQueryWithReauth';
import { useAppDispatch, useAppSelector } from './app/hooks';
import { DEFAULT_LANDING_BY_ROLE, PUBLIC_ROUTES } from '@propflow/shared';
import LoginPage from './pages/LoginPage';
import RegisterTenantPage from './pages/RegisterTenantPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import DashboardPage from './pages/DashboardPage';
import PropertiesPage from './pages/PropertiesPage';
import MyPropertiesPage from './pages/MyPropertiesPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import PropertyFormPage from './pages/PropertyFormPage';
import SiteVisitsPage from './pages/SiteVisitsPage';
import UsersPage from './pages/UsersPage';
import MasterDataPage from './pages/MasterDataPage';
import PlatformTenantsPage from './pages/PlatformTenantsPage';
import PlatformSecurityPage from './pages/PlatformSecurityPage';
import ForbiddenPage from './pages/ForbiddenPage';
import NotFoundPage from './pages/NotFoundPage';
import RoleGuard from './components/RoleGuard';
import AppLayout from './components/AppLayout';

export default function App() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const location = useLocation();

  useEffect(() => {
    installTokenBridge(dispatch);
    resetRefreshFlight();
  }, [dispatch]);

  const isPublic = PUBLIC_ROUTES.some((p) => location.pathname.startsWith(p));

  if (!user && !isPublic) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterTenantPage />} />
      <Route path="/invite/accept" element={<AcceptInvitePage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />

      <Route element={<AppLayout />}>
        <Route
          path="/dashboard"
          element={
            <RoleGuard permission="dashboard:view">
              <DashboardPage />
            </RoleGuard>
          }
        />
        <Route
          path="/properties"
          element={
            <RoleGuard permission="property:listAll">
              <PropertiesPage />
            </RoleGuard>
          }
        />
        <Route
          path="/my-properties"
          element={
            <RoleGuard roles={['AGENT', 'ADMIN', 'MANAGER']}>
              <MyPropertiesPage />
            </RoleGuard>
          }
        />
        <Route
          path="/properties/new"
          element={
            <RoleGuard permission="property:create">
              <PropertyFormPage />
            </RoleGuard>
          }
        />
        <Route
          path="/properties/:id"
          element={
            <RoleGuard anyPermission={['property:listAll', 'property:chat']}>
              <PropertyDetailPage />
            </RoleGuard>
          }
        />
        <Route
          path="/site-visits"
          element={
            <RoleGuard permission="property:visits">
              <SiteVisitsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RoleGuard permission="users:manage">
              <UsersPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/master-data"
          element={
            <RoleGuard permission="masterdata:manage">
              <MasterDataPage />
            </RoleGuard>
          }
        />
        <Route
          path="/platform/tenants"
          element={
            <RoleGuard permission="platform:tenants">
              <PlatformTenantsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/platform/security"
          element={
            <RoleGuard permission="platform:security">
              <PlatformSecurityPage />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function RootRedirect() {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={DEFAULT_LANDING_BY_ROLE[user.role] ?? '/dashboard'} replace />;
}

export function FullPageSpinner() {
  return (
    <Box display="flex" alignItems="center" justifyContent="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  );
}
