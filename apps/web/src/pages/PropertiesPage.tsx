import { useCallback, useEffect, useMemo, useState } from 'react';
// DataGrid toolbar is rendered by the page itself (bulk controls live in the page header)
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Drawer, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import {
  DataGrid, type GridColDef, type GridPaginationModel, type GridSortModel,
} from '@mui/x-data-grid';
import { STATUS_VALUES, LISTING_TYPES, PROPERTY_TYPES, BHK_VALUES, formatINR, roleHas, type Permission } from '@propflow/shared';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { useListQuery, useBulkMutation, useExportMutation } from '../app/api/propertiesApi';
import { showSnack, setColumnVisibility } from '../app/slices/uiSlice';
import { apiErrorMessage } from '../app/apiError';
import { formatInZone } from '@propflow/shared';

const FILTER_KEYS = ['status', 'listingType', 'propertyType', 'bhk', 'priceMin', 'priceMax', 'areaMin', 'areaMax', 'locality', 'agentId', 'amenities', 'dateFrom', 'dateTo', 'q'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type FilterState = Partial<Record<FilterKey, string>>;

const PAGE_KEY = 'page';
const PAGE_SIZE_KEY = 'pageSize';
const SORT_KEY = 'sortBy';
const DIR_KEY = 'sortDir';

export default function PropertiesPage() {
  const columnVisibility = useAppSelector((s) => s.ui.columnVisibility);
  const [params, setParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  const filters: FilterState = useMemo(() => {
    const s: FilterState = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) s[k] = v;
    }
    return s;
  }, [params]);

  const page = Number(params.get(PAGE_KEY) ?? 1);
  const pageSize = Number(params.get(PAGE_SIZE_KEY) ?? 25);
  const sortBy = params.get(SORT_KEY) ?? 'updatedAt';
  const sortDir = params.get(DIR_KEY) ?? 'desc';

  const query = useMemo(
    () => ({ ...filters, page, pageSize, sortBy, sortDir }),
    [filters, page, pageSize, sortBy, sortDir],
  );

  const { data, isLoading, isFetching, isError, refetch } = useListQuery(query);
  const [bulk] = useBulkMutation();
  const [exportProperties, { isLoading: isExporting }] = useExportMutation();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDialog, setBulkDialog] = useState<null | 'status' | 'reassign'>(null);
  const [bulkStatus, setBulkStatus] = useState('Listed');
  const [filterOpen, setFilterOpen] = useState(false);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in patch)) next.set(PAGE_KEY, '1');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const total = data?.meta.total ?? 0;
  const rows = data?.data ?? [];

  const columns: GridColDef[] = [
    { field: 'title', headerName: 'Title', flex: 1.4, minWidth: 220 },
    { field: 'propertyType', headerName: 'Type', width: 110 },
    { field: 'listingType', headerName: 'Sale/Rent', width: 95 },
    { field: 'bhk', headerName: 'BHK', width: 70 },
    { field: 'status', headerName: 'Status', width: 115,
      renderCell: (p) => <StatusChip status={p.row.status} /> },
    { field: 'locality', headerName: 'Locality', flex: 1, minWidth: 140 },
    { field: 'price', headerName: 'Price', width: 130,
      valueGetter: (_v, row) => Number(row.priceInr),
      renderCell: (p) => formatINR(Number(p.row.priceInr)) },
    { field: 'carpetAreaSqft', headerName: 'Area', width: 95 },
    { field: 'updatedAt', headerName: 'Updated', width: 160, valueFormatter: (v) => (v ? formatInZone(v as string, 'Asia/Kolkata') : '') },
  ];

  const paginationModel: GridPaginationModel = { page: page - 1, pageSize };
  const sortModel: GridSortModel = [{ field: sortBy, sort: sortDir as 'asc' | 'desc' }];

  const handleExport = async () => {
    try {
      const blob = await exportProperties({ ...filters, sortBy, sortDir }).unwrap();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `propflow-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      dispatch(showSnack({ message: apiErrorMessage(error, 'Export failed'), severity: 'error' }));
    }
  };

  const canExport = user ? roleHas(user.role, 'property:export' as Permission) : false;
  const canBulk = user ? roleHas(user.role, 'property:bulk' as Permission) : false;

  const activeFilterCount = Object.keys(filters).length;

  return (
    <Container maxWidth={false} disableGutters>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={800}>
          Properties {total > 0 && <Typography component="span" color="text.secondary">({total.toLocaleString('en-IN')})</Typography>}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<FilterListIcon />} onClick={() => setFilterOpen(true)}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <IconButton onClick={() => refetch()}><RefreshIcon /></IconButton>
          {canExport && (
            <Tooltip title="Export current filtered view (XLSX)">
              <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport} disabled={isFetching || isExporting}>
                {isExporting ? 'Exporting…' : 'Export'}
              </Button>
            </Tooltip>
          )}
          {user && roleHas(user.role, 'property:create' as Permission) && (
            <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/properties/new">
              New property
            </Button>
          )}
        </Stack>
      </Stack>

      {activeFilterCount > 0 && (
        <Stack direction="row" spacing={1} mb={1.5} flexWrap="wrap" useFlexGap>
          {Object.entries(filters).map(([k, v]) => (
            <Chip
              key={k}
              label={`${k}: ${v}`}
              size="small"
              onDelete={() => updateParams({ [k]: null })}
            />
          ))}
          <Chip label="Clear all" size="small" color="primary" onClick={() => setParams(new URLSearchParams(), { replace: true })} />
        </Stack>
      )}

      {isError && <AlertWithRetry onRetry={() => refetch()} />}

      <Box sx={{ height: 'calc(100vh - 280px)', minHeight: 420, width: '100%', '& .MuiDataGrid-root': { border: 'none' } }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          rowCount={total}
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={(m) =>
            updateParams({ [PAGE_KEY]: String(m.page + 1), [PAGE_SIZE_KEY]: String(m.pageSize) })
          }
          pageSizeOptions={[10, 25, 50, 100]}
          sortModel={sortModel}
          onSortModelChange={(m) => {
            const first = m[0];
            if (first) updateParams({ [SORT_KEY]: first.field, [DIR_KEY]: first.sort ?? 'asc' });
          }}
          checkboxSelection={canBulk}
          rowSelectionModel={canBulk ? selectedIds : undefined}
          onRowSelectionModelChange={(ids) => setSelectedIds(ids as string[])}
          columnVisibilityModel={columnVisibility}
          onColumnVisibilityModelChange={(model) => dispatch(setColumnVisibility(model))}
          loading={isLoading || isFetching}
          disableRowSelectionOnClick
          density="compact"
        />
      </Box>

      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={(next) => {
          updateParams(next as Record<string, string | null>);
          setFilterOpen(false);
        }}
      />

      <Dialog open={bulkDialog === 'status'} onClose={() => setBulkDialog(null)}>
        <DialogTitle>Bulk status change</DialogTitle>
        <DialogContent>
          <DialogContentText mb={2}>{selectedIds.length} properties selected. All changes run in one transaction.</DialogContentText>
          <FormControl fullWidth size="small">
            <InputLabel>New status</InputLabel>
            <Select value={bulkStatus} label="New status" onChange={(e) => setBulkStatus(e.target.value)}>
              {STATUS_VALUES.filter((s) => !['Closed', 'Withdrawn'].includes(s)).map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                const res = await bulk({ ids: selectedIds, operation: { op: 'status', status: bulkStatus } }).unwrap();
                dispatch(showSnack({ message: `Updated ${res.updated} properties`, severity: 'success' }));
              } catch (e) {
                dispatch(showSnack({ message: apiErrorMessage(e, 'Bulk update failed'), severity: 'error' }));
              }
              setBulkDialog(null);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

function StatusChip({ status }: { status: string }) {
  const colorMap: Record<string, 'default' | 'primary' | 'info' | 'warning' | 'success' | 'error'> = {
    Draft: 'default',
    Listed: 'primary',
    SiteVisit: 'info',
    Negotiation: 'warning',
    Closed: 'success',
    Withdrawn: 'error',
  };
  return <Chip size="small" label={status} color={colorMap[status] ?? 'default'} variant="outlined" />;
}

function FilterDrawer({
  open, onClose, filters, onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (f: FilterState) => void;
}) {
  const [draft, setDraft] = useState<FilterState>(filters);
  useEffect(() => setDraft(filters), [filters]);

  const set = (k: FilterKey, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 340, p: 2 } }}>
      <Typography variant="h6" mb={2}>Filters</Typography>
      <Stack spacing={2}>
        <TextField label="Search (title, building, unit, locality, owner, phone)" size="small" value={draft.q ?? ''} onChange={(e) => set('q', e.target.value)} />
        <FormControl size="small">
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={draft.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            {STATUS_VALUES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>Sale / Rent</InputLabel>
          <Select label="Sale / Rent" value={draft.listingType ?? ''} onChange={(e) => set('listingType', e.target.value)}>
            {LISTING_TYPES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>Property type</InputLabel>
          <Select label="Property type" value={draft.propertyType ?? ''} onChange={(e) => set('propertyType', e.target.value)}>
            {PROPERTY_TYPES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>BHK</InputLabel>
          <Select label="BHK" value={draft.bhk ?? ''} onChange={(e) => set('bhk', e.target.value)}>
            {BHK_VALUES.map((s) => <MenuItem key={s} value={String(s)}>{s === 0 ? 'N/A' : s}</MenuItem>)}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1}>
          <TextField label="Price min ₹" size="small" type="number" value={draft.priceMin ?? ''} onChange={(e) => set('priceMin', e.target.value)} />
          <TextField label="Price max ₹" size="small" type="number" value={draft.priceMax ?? ''} onChange={(e) => set('priceMax', e.target.value)} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField label="Area min sqft" size="small" type="number" value={draft.areaMin ?? ''} onChange={(e) => set('areaMin', e.target.value)} />
          <TextField label="Area max sqft" size="small" type="number" value={draft.areaMax ?? ''} onChange={(e) => set('areaMax', e.target.value)} />
        </Stack>
        <TextField label="Locality (comma separated)" size="small" value={draft.locality ?? ''} onChange={(e) => set('locality', e.target.value)} />
        <TextField label="Agent ID" size="small" value={draft.agentId ?? ''} onChange={(e) => set('agentId', e.target.value)} />
        <Stack direction="row" spacing={1}>
          <TextField label="From" size="small" type="date" InputLabelProps={{ shrink: true }} value={draft.dateFrom ?? ''} onChange={(e) => set('dateFrom', e.target.value)} />
          <TextField label="To" size="small" type="date" InputLabelProps={{ shrink: true }} value={draft.dateTo ?? ''} onChange={(e) => set('dateTo', e.target.value)} />
        </Stack>
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button onClick={() => onApply({})}>Clear</Button>
          <Button variant="contained" onClick={() => onApply(draft)}>Apply</Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}

function AlertWithRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography color="error">Failed to load properties.</Typography>
      <Button size="small" onClick={onRetry}>Retry</Button>
    </Stack>
  );
}
