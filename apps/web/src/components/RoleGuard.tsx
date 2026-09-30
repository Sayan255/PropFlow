import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { roleHas, type Permission, type Role } from '@propflow/shared';
import { useAppSelector } from '../app/hooks';

interface Props {
  children: ReactNode;
  permission?: Permission;
  anyPermission?: Permission[];
  roles?: Role[];
}

/** Layer-2 RBAC: hides/blocks unauthorized routes; backend remains the source of truth (layer 3). */
export default function RoleGuard({ children, permission, anyPermission, roles }: Props) {
  const user = useAppSelector((s) => s.auth.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const roleAllowed = roles ? roles.includes(user.role) : true;
  const permAllowed = permission
    ? roleHas(user.role, permission)
    : anyPermission
      ? anyPermission.some((p) => roleHas(user.role, p))
      : true;

  if (!roleAllowed || !permAllowed) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}
