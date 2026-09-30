import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography, CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, DEFAULT_LANDING_BY_ROLE, roleHas, type Role } from '@propflow/shared';
import { authFetch } from '../app/baseQueryWithReauth';
import { credentialsReceived } from '../app/slices/authSlice';
import { useAppDispatch } from '../app/hooks';

interface FormShape {
  email: string;
  password: string;
}

function roleCanOpenPath(role: Role, target: string): boolean {
  if (!target.startsWith('/') || target.startsWith('//')) return false;
  const path = target.split(/[?#]/, 1)[0];
  if (path === '/dashboard') return roleHas(role, 'dashboard:view');
  if (path === '/properties') return roleHas(role, 'property:listAll');
  if (path === '/properties/new') return roleHas(role, 'property:create');
  if (/^\/properties\/[^/]+$/.test(path)) {
    return roleHas(role, 'property:listAll') || roleHas(role, 'property:chat');
  }
  if (path === '/my-properties') return ['ADMIN', 'MANAGER', 'AGENT'].includes(role);
  if (path === '/site-visits') return roleHas(role, 'property:visits');
  if (path === '/admin/users') return roleHas(role, 'users:manage');
  if (path === '/admin/master-data') return roleHas(role, 'masterdata:manage');
  if (path === '/platform/tenants') return roleHas(role, 'platform:tenants');
  if (path === '/platform/security') return roleHas(role, 'platform:security');
  return false;
}

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [serverError, setServerError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormShape>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockUntil]);

  const onSubmit = async (values: FormShape) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const { status, data } = await authFetch('/auth/login', values);
      if (status === 200 && data.accessToken && data.user) {
        dispatch(credentialsReceived({ accessToken: data.accessToken, user: data.user, expiresIn: data.expiresIn }));
        const role = data.user.role as Role;
        const destination = next && roleCanOpenPath(role, next)
          ? next
          : DEFAULT_LANDING_BY_ROLE[role] || '/dashboard';
        navigate(destination, { replace: true });
        return;
      }
      const code = data?.error?.code;
      if (status === 429) {
        const secs = Number(data?.error?.details?.retryAfterSeconds ?? 900);
        setLockUntil(Date.now() + secs * 1000);
        setServerError(data?.error?.message ?? 'Too many attempts');
      } else if (status === 401) {
        const remaining = data?.error?.details?.attemptsRemaining;
        setAttemptsRemaining(typeof remaining === 'number' ? remaining : null);
        setServerError(data?.error?.message ?? 'Login failed');
      } else {
        setServerError(data?.error?.message ?? `Login failed (${status})`);
      }
      void code;
    } finally {
      setSubmitting(false);
    }
  };

  const locked = lockUntil !== null && lockUntil > now;

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" sx={{ background: (t) => t.palette.background.default }} px={2}>
      <Card sx={{ width: 420, maxWidth: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            PropFlow
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Multi-Tenant Real Estate CRM
          </Typography>

          {serverError && (
            <Alert severity={locked ? 'warning' : 'error'} sx={{ mb: 2 }}>
              {serverError}
              {locked && lockUntil && (
                <Box component="span" display="block" mt={1} fontWeight={700}>
                  Retry in {Math.max(0, Math.ceil((lockUntil - now) / 1000))}s
                </Box>
              )}
            </Alert>
          )}
          {!locked && attemptsRemaining !== null && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining before a 15-minute lockout
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                autoFocus
                {...register('email')}
                error={!!errors.email}
                helperText={errors.email?.message}
              />
              <TextField
                label="Password"
                type="password"
                fullWidth
                {...register('password')}
                error={!!errors.password}
                helperText={errors.password?.message}
              />
              <Button type="submit" variant="contained" size="large" disabled={submitting || locked}>
                {submitting ? <CircularProgress size={22} /> : 'Login'}
              </Button>
            </Stack>
          </form>

          <Stack direction="row" spacing={2} justifyContent="space-between" mt={3}>
            <Link component={RouterLink} to="/register">
              Register your company
            </Link>
            <Link component={RouterLink} to="/invite/accept">
              Accept invitation
            </Link>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
