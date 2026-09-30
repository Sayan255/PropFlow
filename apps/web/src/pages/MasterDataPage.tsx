import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownIcon from '@mui/icons-material/ArrowDownward';
import { MASTER_KINDS, type MasterKind } from '@propflow/shared';
import { useMasterDataQuery, useMasterCreateMutation, useMasterUpdateMutation, useMasterRemoveMutation } from '../app/api/miscApis';
import { useAppDispatch } from '../app/hooks';
import { apiErrorMessage, apiErrorStatus } from '../app/apiError';
import { showSnack } from '../app/slices/uiSlice';

export default function MasterDataPage() {
  const dispatch = useAppDispatch();
  const [kind, setKind] = useState<MasterKind>('LOCALITY');
  const { data, refetch } = useMasterDataQuery({ kind });
  const [create] = useMasterCreateMutation();
  const [update] = useMasterUpdateMutation();
  const [remove] = useMasterRemoveMutation();

  const [newLabel, setNewLabel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const items = (data?.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const addItem = async () => {
    if (!newLabel.trim()) return;
    try {
      await create({ kind, label: newLabel.trim(), value: newLabel.trim(), sortOrder: items.length, active: true }).unwrap();
      setNewLabel('');
      refetch();
    } catch (e) {
      dispatch(showSnack({ message: apiErrorMessage(e, 'Create failed'), severity: 'error' }));
    }
  };

  const tryDelete = async (id: string) => {
    try {
      await remove(id).unwrap();
      refetch();
    } catch (e) {
      dispatch(
        showSnack({
          message: apiErrorStatus(e) === 422 ? apiErrorMessage(e, 'Delete failed') : 'Delete failed',
          severity: 'error',
        }),
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const other = items[index + dir];
    const current = items[index];
    if (!other || !current) return;
    await Promise.all([
      update({ id: current.id, sortOrder: other.sortOrder }).unwrap(),
      update({ id: other.id, sortOrder: current.sortOrder }).unwrap(),
    ]);
    refetch();
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>Master data</Typography>

      <Paper sx={{ mb: 1 }}>
        <Tabs value={kind} onChange={(_, v) => setKind(v)}>
          {MASTER_KINDS.map((k) => (
            <Tab key={k} value={k} label={k.replace('_', ' ')} />
          ))}
        </Tabs>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} mb={2}>
          <TextField
            size="small"
            label={`New ${kind.replace('_', ' ').toLowerCase()} label`}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={addItem}>
            Add
          </Button>
        </Stack>

        {items.map((item, i) => (
          <Stack key={item.id} direction="row" alignItems="center" spacing={1} py={0.75} borderBottom={1} borderColor="divider">
            <Typography flex={1}>{item.label}</Typography>
            <Chip size="small" label={item.active ? 'active' : 'inactive'} color={item.active ? 'success' : 'default'} />
            <Button size="small" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpIcon fontSize="small" /></Button>
            <Button size="small" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDownIcon fontSize="small" /></Button>
            <Button
              size="small"
              onClick={() =>
                update({ id: item.id, active: !item.active })
                  .unwrap()
                  .then(refetch)
                  .catch((e) => dispatch(showSnack({ message: e?.data?.error?.message ?? 'Update failed', severity: 'error' })))
              }
            >
              {item.active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button size="small" color="error" onClick={() => setDeleteTarget({ id: item.id, label: item.label })}>
              <DeleteIcon fontSize="small" />
            </Button>
          </Stack>
        ))}
        {items.length === 0 && <Box py={4} textAlign="center"><Typography color="text.secondary">No items yet.</Typography></Box>}
      </Paper>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete “{deleteTarget?.label}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            If this item is in use by any property, the server will refuse (422) — deactivate it instead.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={() => deleteTarget && tryDelete(deleteTarget.id)}>Delete</Button>
        </DialogActions>
      </Dialog>
      <Box pb={4} />
    </Stack>
  );
}
