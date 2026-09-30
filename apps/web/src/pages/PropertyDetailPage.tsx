import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Grid, MenuItem, Paper, Stack, Step, StepLabel, Stepper,
  TextField, Typography, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { io, type Socket } from 'socket.io-client';
import { STATUS_VALUES, formatINR, pricePerSqft } from '@propflow/shared';
import { useAppSelector, useAppDispatch } from '../app/hooks';
import { useDetailQuery, useUpdateMutation } from '../app/api/propertiesApi';
import { useVisitCreateMutation } from '../app/api/miscApis';
import { showSnack } from '../app/slices/uiSlice';
import { apiErrorCode, apiErrorMessage, apiErrorDetails, apiErrorStatus } from '../app/apiError';

import NotFoundPage from './NotFoundPage';
import ChatPanel from '../components/ChatPanel';

const STATUS_FLOW = ['Draft', 'Listed', 'SiteVisit', 'Negotiation', 'Closed'] as const;

export default function PropertyDetailPage() {
  const { id = '' } = useParams();
  const dispatch = useAppDispatch();
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { data, isLoading, isError, refetch } = useDetailQuery(id);
  const [update] = useUpdateMutation();
  const [createVisit] = useVisitCreateMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ priceInr: string; status: string; version: number } | null>(null);
  const [conflict, setConflict] = useState<{ latest: Record<string, unknown>; mine: Record<string, unknown> } | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const [notes, setNotes] = useState<{ id: string; userId: string; body: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (data?.notes) setNotes(data.notes);
  }, [data?.notes]);

  useEffect(() => {
    if (!accessToken || !id) return;
    const socket = io('/crm-api', { path: '/crm-api/socket.io', auth: { token: accessToken } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('property:join', { propertyId: id }));
    socket.on('note:new', (n: { id: string; userId: string; body: string; createdAt: string }) => {
      setNotes((prev) => (prev.some((p) => p.id === n.id) ? prev : [...prev, n]));
    });
    socket.on('property:updated', () => refetch());
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, id, refetch]);

  const property = data?.property;

  const stepIndex = useMemo(() => {
    if (!property) return 0;
    if (property.status === 'Withdrawn') return -1;
    return STATUS_FLOW.indexOf(property.status as (typeof STATUS_FLOW)[number]);
  }, [property]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={8}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !property) return <NotFoundPage />;

  const pps = pricePerSqft(Number(property.priceInr), property.carpetAreaSqft);

  const save = async () => {
    if (!form) return;
    try {
      await update({ id, priceInr: Number(form.priceInr), status: form.status, version: form.version }).unwrap();
      setEditOpen(false);
      dispatch(showSnack({ message: 'Property updated', severity: 'success' }));
    } catch (e) {
      if (apiErrorStatus(e) === 409 || apiErrorCode(e) === 'CONFLICT') {
        setConflict({ latest: (apiErrorDetails(e)?.latest ?? {}) as Record<string, unknown>, mine: { ...property, priceInr: form.priceInr, status: form.status } });
        setEditOpen(false);
      } else {
        dispatch(showSnack({ message: apiErrorMessage(e, 'Update failed'), severity: 'error' }));
      }
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={800}>{property.title}</Typography>
          <Typography color="text.secondary">
            {property.buildingName}, Unit {property.unitNo} · {property.locality}, {property.city} · v{property.version}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<EditIcon />} onClick={() => { setForm({ priceInr: property.priceInr, status: property.status, version: property.version }); setEditOpen(true); }}>
          Edit
        </Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stepper activeStep={stepIndex} alternativeLabel>
          {STATUS_FLOW.map((s) => (
            <Step key={s}><StepLabel>{s}</StepLabel></Step>
          ))}
        </Stepper>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
              <Box>
                <Typography variant="caption" color="text.secondary">Price</Typography>
                <Typography variant="h6">{formatINR(Number(property.priceInr))}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Price / sqft</Typography>
                <Typography variant="h6">₹{pps.toLocaleString('en-IN')}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Carpet area</Typography>
                <Typography variant="h6">{property.carpetAreaSqft.toLocaleString('en-IN')} sqft</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Config</Typography>
                <Typography variant="h6">{property.bhk > 0 ? `${property.bhk} BHK ${property.propertyType}` : property.propertyType}</Typography>
              </Box>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
              <Box>
                <Typography variant="caption" color="text.secondary">Owner</Typography>
                <Typography>{property.ownerName}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Owner phone</Typography>
                <Typography fontWeight={600}>
                  {property.ownerPhoneVisible ? property.ownerPhone : property.ownerPhone}
                </Typography>
                {!property.ownerPhoneVisible && (
                  <Typography variant="caption" color="text.secondary">Masked — ask your manager for full access</Typography>
                )}
              </Box>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>Amenities</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(property.amenities ?? []).map((a) => <Chip key={a} label={a} size="small" />)}
              {(property.amenities ?? []).length === 0 && <Typography color="text.secondary">None</Typography>}
            </Stack>
          </Paper>

          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Activity timeline</Typography>
            {data!.activities.length === 0 && <Typography color="text.secondary">No changes yet.</Typography>}
            {data!.activities.map((a) => (
              <Box key={a.id} py={1} borderBottom={1} borderColor="divider">
                <Typography variant="body2">
                  <b>{a.userId.slice(0, 8)}</b> · {new Date(a.createdAt).toLocaleString('en-IN')}
                </Typography>
                {Object.entries(a.changedFields).map(([field, change]) => {
                  const c = change as { old?: unknown; new?: unknown };
                  return (
                    <Typography key={field} variant="caption" color="text.secondary" component="div">
                      {field}: {JSON.stringify(c?.old ?? null)} → {JSON.stringify(c?.new ?? null)}
                    </Typography>
                  );
                })}
              </Box>
            ))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Notes</Typography>
            {notes.map((n) => (
              <Box key={n.id} py={1} borderBottom={1} borderColor="divider">
                <Typography variant="body2">{n.body}</Typography>
                <Typography variant="caption" color="text.secondary">{new Date(n.createdAt).toLocaleString('en-IN')}</Typography>
              </Box>
            ))}
            <TextField
              label="Add note"
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              sx={{ mt: 1 }}
            />
            <Button
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
              onClick={() => {
                if (!noteBody.trim()) return;
                socketRef.current?.emit('note:new', { propertyId: id, body: noteBody.trim() });
                setNoteBody('');
              }}
            >
              Add note (live)
            </Button>
          </Paper>

          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Site visits</Typography>
            {data!.visits.map((v) => (
              <Box key={v.id} py={0.5}>
                <Typography variant="body2">
                  {new Date(v.visitAtUtc).toLocaleString('en-IN')} · <Chip size="small" label={v.outcome} />
                </Typography>
              </Box>
            ))}
            <Button
              size="small"
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={async () => {
                const at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
                try {
                  await createVisit({ propertyId: id, visitAtUtc: at }).unwrap();
                  refetch();
                  dispatch(showSnack({ message: 'Visit scheduled', severity: 'success' }));
                } catch {
                  dispatch(showSnack({ message: 'Could not schedule visit', severity: 'error' }));
                }
              }}
            >
              Schedule visit tomorrow
            </Button>
          </Paper>

          <Box mt={2}>
            <ChatPanel propertyId={id} />
          </Box>
        </Grid>
      </Grid>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogTitle>Edit property</DialogTitle>
        <DialogContent>
          <TextField
            label="Price (₹)"
            fullWidth
            margin="normal"
            type="number"
            value={form?.priceInr ?? ''}
            onChange={(e) => setForm((f) => (f ? { ...f, priceInr: e.target.value } : f))}
          />
          <TextField
            select
            label="Status"
            fullWidth
            margin="normal"
            value={form?.status ?? 'Draft'}
            onChange={(e) => setForm((f) => (f ? { ...f, status: e.target.value } : f))}
          >
            {STATUS_VALUES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Conflict dialog (H6) */}
      <Dialog open={!!conflict} onClose={() => setConflict(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Version conflict</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Someone else updated this property while you were editing. Review the differences below.
          </Alert>
          {conflict &&
            Object.keys(conflict.mine)
              .filter((k) => !['id', 'version', 'updatedAt'].includes(k))
              .filter((k) => JSON.stringify(conflict.latest[k]) !== JSON.stringify(conflict.mine[k]))
              .map((k) => (
                <Box key={k} display="grid" gridTemplateColumns="1fr 1fr 1fr" gap={1} py={0.5} borderBottom={1} borderColor="divider">
                  <Typography variant="body2" fontWeight={700}>{k}</Typography>
                  <Typography variant="body2">Theirs: {String(conflict.latest[k])}</Typography>
                  <Typography variant="body2">Yours: {String(conflict.mine[k])}</Typography>
                </Box>
              ))}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConflict(null);
              refetch();
            }}
          >
            Discard
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!conflict) return;
              try {
                const latest = conflict.latest as unknown as typeof property;
                await update({
                  id,
                  priceInr: Number(form!.priceInr),
                  status: form!.status,
                  version: latest.version,
                }).unwrap();
                setConflict(null);
                dispatch(showSnack({ message: 'Merged with latest version', severity: 'success' }));
              } catch {
                dispatch(showSnack({ message: 'Merge failed — please retry', severity: 'error' }));
              }
            }}
          >
            Save merged
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
