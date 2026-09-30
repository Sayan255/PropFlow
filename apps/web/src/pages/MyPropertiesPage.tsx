import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Link, Stack, Typography } from '@mui/material';
import { formatINR } from '@propflow/shared';
import { useListQuery } from '../app/api/propertiesApi';
import { useSiteVisitsQuery } from '../app/api/miscApis';
import { useAppSelector } from '../app/hooks';

export default function MyPropertiesPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { data: visits } = useSiteVisitsQuery();
  const { data, isLoading, isError, refetch } = useListQuery({ page: 1, pageSize: 25, sortBy: 'updatedAt', sortDir: 'desc' });

  const now = Date.now();
  const todayStr = new Date().toDateString();
  const todays = (visits?.data ?? []).filter((v) => new Date(v.visitAtUtc).toDateString() === todayStr && v.outcome === 'Scheduled');
  const overdue = (visits?.data ?? []).filter((v) => v.outcome === 'Scheduled' && new Date(v.visitAtUtc).getTime() < now);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>My properties</Typography>

      {isError && (
        <Alert severity="error">
          Failed to load. <Button onClick={() => refetch()}>Retry</Button>
        </Alert>
      )}

      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Today's visits ({todays.length})</Typography>
        {todays.length === 0 && <Typography color="text.secondary">No visits scheduled today.</Typography>}
        {todays.map((v) => (
          <Card key={v.id} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2">
                {new Date(v.visitAtUtc).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · property {v.propertyId.slice(-6)}
              </Typography>
              <Button size="small" component={RouterLink} to={`/properties/${v.propertyId}`}>
                Open
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom color="warning.main">
          Overdue visits ({overdue.length})
        </Typography>
        {overdue.map((v) => (
          <Card key={v.id} sx={{ mb: 1, borderLeft: 4, borderColor: 'warning.main' }}>
            <CardContent sx={{ py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2">
                was {new Date(v.visitAtUtc).toLocaleString('en-IN')} · property {v.propertyId.slice(-6)}
              </Typography>
              <Button size="small" component={RouterLink} to={`/properties/${v.propertyId}`}>
                Open
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Assigned properties</Typography>
        {isLoading && <Typography color="text.secondary">Loading…</Typography>}
        {data?.data.map((p) => (
          <Card key={p.id} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Box>
                <Link component={RouterLink} to={`/properties/${p.id}`} fontWeight={600}>
                  {p.title}
                </Link>
                <Typography variant="caption" color="text.secondary" display="block">
                  {p.buildingName} · {p.locality} · {formatINR(Number(p.priceInr))}
                </Typography>
              </Box>
              <Chip size="small" label={p.status} variant="outlined" />
            </CardContent>
          </Card>
        ))}
        {data && data.data.length === 0 && (
          <Typography color="text.secondary">
            No properties assigned yet{user ? `, ${user.name}` : ''}. Your manager can reassign listings to you.
          </Typography>
        )}
      </Box>
      <Box pb={4} />
    </Stack>
  );
}
