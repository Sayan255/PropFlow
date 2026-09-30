import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, TextField, Typography, CircularProgress } from '@mui/material';
import { authFetch } from '../app/baseQueryWithReauth';
import { credentialsReceived } from '../app/slices/authSlice';
import { useAppDispatch } from '../app/hooks';
import { DEFAULT_LANDING_BY_ROLE, type Role } from '@propflow/shared';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { status, data } = await authFetch('/auth/acceptinvite', { token, name, password });
      if (status === 200 && data.accessToken && data.user) {
        dispatch(credentialsReceived({ accessToken: data.accessToken, user: data.user, expiresIn: data.expiresIn }));
        navigate(DEFAULT_LANDING_BY_ROLE[data.user.role as Role] ?? '/my-properties', { replace: true });
      } else {
        setError(data?.error?.message ?? `Accept failed (${status})`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" px={2} sx={{ background: (t) => t.palette.background.default }}>
      <Card sx={{ width: 420, maxWidth: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Join your team
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Set your name and password to activate the invitation.
          </Typography>
          {!token && <Alert severity="error" sx={{ mb: 2 }}>Missing invitation token in URL.</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={submit} noValidate>
            <TextField label="Your name" fullWidth margin="normal" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="10+ chars with upper, lower and digit"
              required
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={submitting || !token}
              sx={{ mt: 2 }}
            >
              {submitting ? <CircularProgress size={22} /> : 'Accept invitation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
