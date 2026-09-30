import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Snackbar, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownIcon from '@mui/icons-material/ArrowDownward';
import { MASTER_KINDS, type MasterKind } from '@propflow/shared';
import { useMasterDataQuery, useMasterUpdateMutation, useMasterRemoveMutation } from '../app/api/miscApis';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { apiErrorStatus } from '../app/apiError';
import { clearSnack, showSnack } from '../app/slices/uiSlice';

export default function MasterDataPage() {
  const dispatch = useAppDispatch();
  const snack = useAppSelector((s) => s.ui.snack);
  const [kind, setKind] = useState<MasterKind>('LOCALITY');
  const { data, refetch } = useMasterDataQuery({ kind });
  const [update] = useMasterUpdateMutation();
  const [remove] = useMasterRemoveMutation();

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const items = (data?.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = normalizedSearch
    ? items.filter((item) => `${item.label} ${item.value}`.toLocaleLowerCase().includes(normalizedSearch))
    : items;

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
            label={`Search ${kind.replace('_', ' ').toLowerCase()}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Stack>

        {visibleItems.map((item) => {
          const i = items.findIndex((entry) => entry.id === item.id);
          return (
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
          );
        })}
        {visibleItems.length === 0 && <Box py={4} textAlign="center"><Typography color="text.secondary">{items.length ? 'No matching items.' : 'No items yet.'}</Typography></Box>}
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
