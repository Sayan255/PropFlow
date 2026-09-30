import { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg } from '@fullcalendar/core';
import { useSiteVisitsQuery, useVisitUpdateMutation } from '../app/api/miscApis';
import { useAppDispatch } from '../app/hooks';
import { showSnack } from '../app/slices/uiSlice';

export default function SiteVisitsPage() {
  const dispatch = useAppDispatch();
  const { data, isError, refetch } = useSiteVisitsQuery();
  const [update] = useVisitUpdateMutation();
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<'dayGridMonth' | 'timeGridWeek'>('dayGridMonth');

  const events = useMemo(
    () =>
      (data?.data ?? []).map((v) => ({
        id: v.id,
        title: `Visit · ${v.propertyId.slice(-4)} · ${v.outcome}`,
        start: v.visitAtUtc,
        backgroundColor:
          v.outcome === 'Completed' ? '#2e7d32' : v.outcome === 'Cancelled' || v.outcome === 'NoShow' ? '#9e9e9e' : undefined,
      })),
    [data],
  );

  const overdue = (data?.data ?? []).filter(
    (v) => v.outcome === 'Scheduled' && new Date(v.visitAtUtc).getTime() < Date.now(),
  );

  const onEventDrop = async (arg: EventDropArg) => {
    const { id, start } = arg.event;
    const revert = () => arg.revert();
    try {
      await update({ id, visitAtUtc: (start ?? new Date()).toISOString() }).unwrap();
      dispatch(showSnack({ message: 'Visit rescheduled', severity: 'success' }));
    } catch {
      revert();
      dispatch(showSnack({ message: 'Reschedule failed — reverted', severity: 'error' }));
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={800}>Site visits</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant={view === 'dayGridMonth' ? 'contained' : 'outlined'} size="small" onClick={() => setView('dayGridMonth')}>
            Month
          </Button>
          <Button variant={view === 'timeGridWeek' ? 'contained' : 'outlined'} size="small" onClick={() => setView('timeGridWeek')}>
            Week
          </Button>
        </Stack>
      </Stack>

      {overdue.length > 0 && (
        <Alert severity="warning">
          {overdue.length} overdue visit{overdue.length === 1 ? '' : 's'} — drag them onto a new slot or mark outcome.
        </Alert>
      )}

      <Card>
        <CardContent>
          {isError ? (
            <Stack spacing={1}>
              <Typography color="error">Failed to load visits.</Typography>
              <Button onClick={() => refetch()}>Retry</Button>
            </Stack>
          ) : (
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={view}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
              events={events}
              editable
              eventDrop={onEventDrop}
              height="auto"
              dayMaxEventRows={4}
              nowIndicator
            />
          )}
        </CardContent>
      </Card>
      <Box pb={4} />
    </Stack>
  );
}
