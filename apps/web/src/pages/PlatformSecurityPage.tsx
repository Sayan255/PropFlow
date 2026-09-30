import { Alert, Box, Button, Card, CardContent, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import { useSecurityEventsQuery, useRotateKeysMutation } from '../app/api/authApi';
import { useAppDispatch } from '../app/hooks';
import { showSnack } from '../app/slices/uiSlice';

export default function PlatformSecurityPage() {
  const dispatch = useAppDispatch();
  const { data, isLoading, refetch } = useSecurityEventsQuery();
  const [rotate, { isLoading: rotating }] = useRotateKeysMutation();

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>Platform security</Typography>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>JWT signing keys</Typography>
              <Typography variant="body2" color="text.secondary">
                Rotation publishes a new public key to JWKS; existing access tokens stay valid until expiry. crm-api requires no restart.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<KeyIcon />}
              disabled={rotating}
              onClick={async () => {
                try {
                  const res = await rotate(undefined).unwrap();
                  dispatch(showSnack({ message: `Rotated to ${(res as { rotatedTo: string }).rotatedTo}`, severity: 'success' }));
                  refetch();
                } catch (e: unknown) {
                  const err = e as { data?: { error?: { message?: string } } };
                  dispatch(showSnack({ message: err?.data?.error?.message ?? 'Rotation failed', severity: 'error' }));
                }
              }}
            >
              {rotating ? 'Rotating…' : 'Rotate signing keys'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="subtitle1" fontWeight={700}>Security events (latest 100)</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>User</TableCell>
              <TableCell>IP</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4}>Loading…</TableCell></TableRow>}
            {(data?.events ?? []).map((rawEvent: unknown, i) => {
              const e = rawEvent as { at: string; type: string; userId?: string; ip?: string };
              return (
                <TableRow key={i}>
                  <TableCell>{new Date(e.at).toLocaleString('en-IN')}</TableCell>
                  <TableCell>{e.type}</TableCell>
                  <TableCell>{e.userId ?? '—'}</TableCell>
                  <TableCell>{e.ip ?? '—'}</TableCell>
                </TableRow>
              );
            })}
            {!isLoading && (data?.events ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Alert severity="info">No events recorded yet.</Alert>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box pb={4} />
    </Stack>
  );
}
