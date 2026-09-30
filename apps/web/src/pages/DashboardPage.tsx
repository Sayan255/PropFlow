import { useState } from 'react';
import { Box, Button, Card, CardContent, Skeleton, Stack, TextField, Typography } from '@mui/material';
import Chart from 'react-apexcharts';
import { formatINR } from '@propflow/shared';
import { useDashboardQuery } from '../app/api/miscApis';

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

const FUNNEL = ['Draft', 'Listed', 'SiteVisit', 'Negotiation', 'Closed'] as const;

export default function DashboardPage() {
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading, isError, refetch } = useDashboardQuery({ from, to });

  if (isError) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>Dashboard</Typography>
        <Card>
          <CardContent>
            <Typography color="error" gutterBottom>Failed to load dashboard.</Typography>
            <Button variant="contained" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  const kpis = data?.kpis;
  const empty = data && data.kpis.totalListings === 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={800}>Dashboard</Typography>
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
        </Stack>
      </Stack>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr 1fr', md: 'repeat(4, 1fr)' }} gap={2}>
        {[
          { label: 'Total Listings', value: kpis ? kpis.totalListings.toLocaleString('en-IN') : null },
          { label: 'Active Listings', value: kpis ? kpis.activeListings.toLocaleString('en-IN') : null },
          { label: 'Site Visits', value: kpis ? kpis.siteVisits.toLocaleString('en-IN') : null },
          { label: 'Closed Value', value: kpis ? formatINR(Number(kpis.closedValueInr)) : null },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{k.label}</Typography>
              <Typography variant="h5" fontWeight={800}>
                {k.value ?? <Skeleton width={80} />}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {empty && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="h6" gutterBottom>No data for this range</Typography>
            <Typography color="text.secondary">Try widening the date range.</Typography>
          </CardContent>
        </Card>
      )}

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '2fr 1fr' }} gap={2}>
        <ChartCard title="Listings over time">
          {isLoading ? (
            <Skeleton variant="rounded" height={260} />
          ) : (
            <Chart
              type="area"
              height={260}
              options={{ chart: { id: 'listings-time' }, xaxis: { type: 'datetime' }, dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 2 }, colors: ['#0f62fe'] }}
              series={[{ name: 'Listings', data: (data?.listingsOverTime ?? []).map((d) => ({ x: d.day, y: d.count })) }]}
            />
          )}
        </ChartCard>
        <ChartCard title="Pipeline funnel">
          {isLoading ? (
            <Skeleton variant="rounded" height={260} />
          ) : (
            <Chart
              type="bar"
              height={260}
              options={{ chart: { id: 'funnel' }, xaxis: { categories: [...FUNNEL] } }}
              series={[{ name: 'Count', data: FUNNEL.map((s) => data?.funnel.find((f) => f.status === s)?.count ?? 0) }]}
            />
          )}
        </ChartCard>
      </Box>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
        <ChartCard title="Property type split">
          {isLoading ? (
            <Skeleton variant="rounded" height={240} />
          ) : (
            <Chart
              type="donut"
              height={240}
              options={{ labels: (data?.propertyTypeSplit ?? []).map((t) => t.type), legend: { position: 'bottom' } }}
              series={(data?.propertyTypeSplit ?? []).map((t) => t.count)}
            />
          )}
        </ChartCard>
        <ChartCard title="Agent leaderboard (closed value)">
          {isLoading ? (
            <Skeleton variant="rounded" height={240} />
          ) : (
            <Chart
              type="bar"
              height={240}
              options={{
                chart: { id: 'agents' },
                plotOptions: { bar: { horizontal: true } },
                xaxis: { categories: (data?.agentLeaderboard ?? []).map((a) => a.agentId.slice(0, 8)) },
              }}
              series={[{ name: 'Closed value (₹)', data: (data?.agentLeaderboard ?? []).map((a) => Number(a.closedValueInr)) }]}
            />
          )}
        </ChartCard>
      </Box>

      {data?.cached && (
        <Typography variant="caption" color="text.secondary">
          Cached result (60s TTL)
        </Typography>
      )}
      <Box pb={4} />
    </Stack>
  );
}
