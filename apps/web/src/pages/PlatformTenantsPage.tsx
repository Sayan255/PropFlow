import { useState } from 'react';
import {
  Box, Button, Chip, Drawer, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Typography, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTenantsQuery } from '../app/api/miscApis';
import { useCreateTenantMutation } from '../app/api/authApi';
import { registerTenantSchema, slugify } from '@propflow/shared';
import { useAppDispatch } from '../app/hooks';
import { apiErrorDetails, apiErrorMessage } from '../app/apiError';
import { showSnack } from '../app/slices/uiSlice';

export default function PlatformTenantsPage() {
  const dispatch = useAppDispatch();
  const { data, isLoading, isError, refetch } = useTenantsQuery();
  const [createTenant, { isLoading: creating }] = useCreateTenantMutation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [slug, setSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [slugEdited, setSlugEdited] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = registerTenantSchema.safeParse({
      companyName: company,
      slug,
      adminName,
      adminEmail,
      adminPassword,
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (field && !nextErrors[field]) nextErrors[field] = issue.message;
      }
      setFieldErrors(nextErrors);
      setError('Please correct the highlighted fields.');
      return;
    }
    setFieldErrors({});
    try {
      await createTenant(parsed.data).unwrap();
      dispatch(showSnack({ message: 'Tenant created', severity: 'success' }));
      setDrawerOpen(false);
      setCompany('');
      setSlug('');
      setSlugEdited(false);
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      refetch();
    } catch (e) {
      const details = apiErrorDetails(e);
      const serverFields = details?.fields;
      if (Array.isArray(serverFields)) {
        const nextErrors: Record<string, string> = {};
        for (const field of serverFields) {
          if (field && typeof field === 'object' && 'path' in field && 'message' in field
            && typeof field.path === 'string' && typeof field.message === 'string') {
            nextErrors[field.path.split('.')[0]] = field.message;
          }
        }
        setFieldErrors(nextErrors);
      } else if (typeof details?.field === 'string') {
        setFieldErrors({ [details.field]: apiErrorMessage(e, 'Invalid value') });
      }
      setError(apiErrorMessage(e, 'Create failed'));
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>Tenants</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDrawerOpen(true)}>
          New tenant
        </Button>
      </Stack>

      {isError && <Alert severity="error">Failed to load tenants. <Button onClick={() => refetch()}>Retry</Button></Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Company</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Users</TableCell>
              <TableCell>Admins</TableCell>
              <TableCell>Properties</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>}
            {(data?.tenants ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.slug}</TableCell>
                <TableCell>{t.userCount}</TableCell>
                <TableCell>{t.adminCount}</TableCell>
                <TableCell>{t.propertyCount.toLocaleString('en-IN')}</TableCell>
                <TableCell>{new Date(t.createdAt).toLocaleDateString('en-IN')}</TableCell>
                <TableCell>
                  <Chip size="small" color={t.status === 'ACTIVE' ? 'success' : 'default'} label={t.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: 400, p: 3 } }}>
        <Typography variant="h6" gutterBottom>Create tenant</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          <TextField
            label="Company name" size="small" value={company}
            onChange={(e) => { setCompany(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); setFieldErrors((prev) => ({ ...prev, companyName: '' })); }}
            error={!!fieldErrors.companyName} helperText={fieldErrors.companyName}
          />
          <TextField
            label="Unique slug" size="small" value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); setFieldErrors((prev) => ({ ...prev, slug: '' })); }}
            error={!!fieldErrors.slug} helperText={fieldErrors.slug || '3–40 characters: lowercase letters, numbers, and hyphens'}
          />
          <TextField label="First admin name" size="small" value={adminName} onChange={(e) => { setAdminName(e.target.value); setFieldErrors((prev) => ({ ...prev, adminName: '' })); }} error={!!fieldErrors.adminName} helperText={fieldErrors.adminName} />
          <TextField label="First admin email" type="email" size="small" value={adminEmail} onChange={(e) => { setAdminEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, adminEmail: '' })); }} error={!!fieldErrors.adminEmail} helperText={fieldErrors.adminEmail} />
          <TextField label="Temp password" type="password" size="small" value={adminPassword} onChange={(e) => { setAdminPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, adminPassword: '' })); }} error={!!fieldErrors.adminPassword} helperText={fieldErrors.adminPassword || '10+ chars with upper/lower/digit'} />
          <Button variant="contained" onClick={submit} disabled={creating}>
            {creating ? 'Creating…' : 'Create (transactional)'}
          </Button>
        </Stack>
      </Drawer>
      <Box pb={4} />
    </Stack>
  );
}
