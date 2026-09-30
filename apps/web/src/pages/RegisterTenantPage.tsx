import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Grid, Link, TextField, Typography, CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerTenantSchema, slugify } from '@propflow/shared';
import { authFetch } from '../app/baseQueryWithReauth';
import { credentialsReceived } from '../app/slices/authSlice';
import { useAppDispatch } from '../app/hooks';

type ZodInput = {
  companyName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword?: string;
};

const formSchema = registerTenantSchema.extend({ confirmPassword: registerTenantSchema.shape.adminPassword });

export default function RegisterTenantPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ZodInput & { confirmPassword?: string }>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (values: ZodInput & { confirmPassword?: string }) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const { status, data } = await authFetch('/auth/register-tenant', {
        companyName: values.companyName,
        slug: values.slug,
        adminName: values.adminName,
        adminEmail: values.adminEmail,
        adminPassword: values.adminPassword,
      });
      if (status === 201 && data.accessToken && data.user) {
        dispatch(
          credentialsReceived({
            accessToken: data.accessToken,
            user: data.user,
            expiresIn: data.expiresIn,
          }),
        );
        navigate('/dashboard', { replace: true });
        return;
      }
      if (status === 409 && data?.error?.details?.field === 'slug') {
        setError('slug', { message: 'This slug is already taken' });
      } else {
        setServerError(data?.error?.message ?? `Registration failed (${status})`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" px={2} sx={{ background: (t) => t.palette.background.default }}>
      <Card sx={{ width: 520, maxWidth: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Create your workspace
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Register your real-estate company on PropFlow
          </Typography>

          {serverError && <Alert severity="error" sx={{ mb: 2 }}>{serverError}</Alert>}

          <form onSubmit={handleSubmit(onSubmit as never)} noValidate>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Company name"
                  fullWidth
                  {...register('companyName')}
                  onChange={(e) => {
                    setValue('companyName', e.target.value);
                    if (!errors.slug) setValue('slug', slugify(e.target.value));
                  }}
                  error={!!errors.companyName}
                  helperText={errors.companyName?.message}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Slug (unique workspace id)"
                  fullWidth
                  {...register('slug')}
                  error={!!errors.slug}
                  helperText={errors.slug?.message ?? 'lowercase letters, numbers, hyphens'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Admin name" fullWidth {...register('adminName')} error={!!errors.adminName} helperText={errors.adminName?.message} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Admin email" type="email" fullWidth {...register('adminEmail')} error={!!errors.adminEmail} helperText={errors.adminEmail?.message} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Password" type="password" fullWidth {...register('adminPassword')} error={!!errors.adminPassword} helperText={errors.adminPassword?.message ?? '10+ chars, upper, lower, digit'} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Confirm password" type="password" fullWidth {...register('confirmPassword')} error={!!errors.confirmPassword} helperText={errors.confirmPassword?.message} />
              </Grid>
              <Grid item xs={12}>
                <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
                  {submitting ? <CircularProgress size={22} /> : 'Create tenant + admin'}
                </Button>
              </Grid>
            </Grid>
          </form>

          <Box mt={3} textAlign="center">
            <Link component={RouterLink} to="/login">
              Already have an account? Login
            </Link>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
