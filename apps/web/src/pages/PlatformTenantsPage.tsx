import { useState } from 'react';
import {
  Box, Button, Chip, Drawer, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Typography, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTenantsQuery } from '../app/api/miscApis';
import { useCreateTenantMutation } from '../app/api/authApi';
import { slugify } from '@propflow/shared';
import { useAppDispatch } from '../app/hooks';
import { apiErrorMessage } from '../app/apiError';
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

  const submit = async () => {
    setError(null);
    try {
      await createTenant({ companyName: company, slug, adminName, adminEmail, adminPassword }).unwrap();
      dispatch(showSnack({ message: 'Tenant created', severity: 'success' }));
      setDrawerOpen(false);
      refetch();
    } catch (e) {
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
          <TextField label="Company name" size="small" value={company} onChange={(e) => { setCompany(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} />
          <TextField label="Unique slug" size="small" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <TextField label="First admin name" size="small" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          <TextField label="First admin email" type="email" size="small" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          <TextField label="Temp password" type="password" size="small" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} helperText="10+ chars with upper/lower/digit" />
          <Button variant="contained" onClick={submit} disabled={creating}>
            {creating ? 'Creating…' : 'Create (transactional)'}
          </Button>
        </Stack>
      </Drawer>
      <Box pb={4} />
    </Stack>
  );
}
