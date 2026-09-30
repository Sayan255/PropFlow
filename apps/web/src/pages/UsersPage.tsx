import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Drawer, FormControl,
  InputLabel, MenuItem, Paper, Select, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useUsersQuery, useInviteMutation, useChangeRoleMutation, useSetUserStatusMutation } from '../app/api/authApi';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { clearSnack, showSnack } from '../app/slices/uiSlice';
import { apiErrorMessage, apiErrorCode, apiErrorStatus } from '../app/apiError';

export default function UsersPage() {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const { data, isLoading, isError, refetch } = useUsersQuery();
  interface RowUser {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
  }
  const [invite, { isLoading: inviting }] = useInviteMutation();
  const [changeRole] = useChangeRoleMutation();
  const [setStatus] = useSetUserStatusMutation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'AGENT' | 'MANAGER' | 'ADMIN'>('AGENT');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastAdminWarn, setLastAdminWarn] = useState<string | null>(null);
  const snack = useAppSelector((s) => s.ui.snack);

  const users = (data?.data ?? []) as unknown as RowUser[];

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      dispatch(showSnack({ message: 'Invitation link copied', severity: 'success' }));
    } catch {
      dispatch(showSnack({ message: 'Copy failed — select and copy manually', severity: 'warning' }));
    }
  };

  const doInvite = async () => {
    setInviteError(null);
    try {
      const res = await invite({ email: inviteEmail, role: inviteRole }).unwrap();
      setInviteLink((res as { invitationLink: string }).invitationLink);
      setInviteExpiry((res as { expiresAt: string }).expiresAt);
    } catch (e) {
      setInviteError(apiErrorMessage(e, 'Invite failed'));
    }
  };

  const guardLastAdmin = async (_userId: string, action: () => Promise<unknown>) => {
    try {
      await action();
      refetch();
    } catch (e) {
      if (apiErrorStatus(e) === 422 || apiErrorCode(e) === 'UNPROCESSABLE') {
        setLastAdminWarn(apiErrorMessage(e, 'Cannot demote/deactivate the last ADMIN'));
      } else {
        dispatch(showSnack({ message: apiErrorMessage(e, 'Update failed'), severity: 'error' }));
      }
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={800}>Users</Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => { setDrawerOpen(true); setInviteLink(null); }}>
          Invite user
        </Button>
      </Stack>

      {lastAdminWarn && <Alert severity="error" onClose={() => setLastAdminWarn(null)}>{lastAdminWarn}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(e) => guardLastAdmin(u.id, () => changeRole({ id: u.id, role: e.target.value }).unwrap())}
                    sx={{ minWidth: 120 }}
                  >
                    {['ADMIN', 'MANAGER', 'AGENT'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </TableCell>
                <TableCell>
                  <Chip size="small" color={u.status === 'ACTIVE' ? 'success' : u.status === 'INVITED' ? 'warning' : 'default'} label={u.status} />
                </TableCell>
                <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : '—'}</TableCell>
                <TableCell align="right">
                  {u.status === 'ACTIVE' ? (
                    <Button
                      size="small"
                      color="error"
                      disabled={u.id === me?.id}
                      onClick={() => guardLastAdmin(u.id, () => setStatus({ id: u.id, status: 'DISABLED' }).unwrap())}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="small" onClick={() => guardLastAdmin(u.id, () => setStatus({ id: u.id, status: 'ACTIVE' }).unwrap())}>
                      Reactivate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {isError && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography color="error">Failed to load users.</Typography>
                    <Button size="small" onClick={() => refetch()}>Retry</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: 380, p: 3 } }}>
        <Typography variant="h6" gutterBottom>Invite user</Typography>
        {inviteError && <Alert severity="error" sx={{ mb: 2 }}>{inviteError}</Alert>}
        <Stack spacing={2}>
          <TextField label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} size="small" />
          <FormControl size="small">
            <InputLabel>Role</InputLabel>
            <Select value={inviteRole} label="Role" onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}>
              {['AGENT', 'MANAGER', 'ADMIN'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={doInvite} disabled={inviting || !inviteEmail}>
            {inviting ? 'Creating…' : 'Create invitation'}
          </Button>
          {inviteLink && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">Invitation link (single-use, expires 24h)</Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{inviteLink}</Typography>
              {inviteExpiry && (
                <Typography variant="caption" color="text.secondary">
                  Expires {new Date(inviteExpiry).toLocaleString('en-IN')}
                </Typography>
              )}
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copyLink(inviteLink)} sx={{ mt: 1 }}>
                Copy link
              </Button>
            </Paper>
          )}
        </Stack>
      </Drawer>

      <Snackbar
        open={!!snack}
        message={snack?.message ?? ''}
        autoHideDuration={4000}
        onClose={() => dispatch(clearSnack())}
      />
      <Box pb={4} />
    </Stack>
  );
}
