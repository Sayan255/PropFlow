import { useEffect, useState } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { apiErrorCode, apiErrorDetails, apiErrorMessage } from '../app/apiError';
import {
  Alert, Button, Card, CardContent, Chip, CircularProgress, FormControl, FormHelperText, InputLabel,
  MenuItem, Select, Stack, TextField, Typography, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { propertyCreateSchema, pricePerSqft, formatINR } from '@propflow/shared';
import { useCreateMutation } from '../app/api/propertiesApi';
import { useMasterDataQuery } from '../app/api/miscApis';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { showSnack } from '../app/slices/uiSlice';

type FormValues = {
  title: string;
  listingType: 'Sale' | 'Rent';
  propertyType: string;
  bhk: number;
  furnishing: string;
  status: string;
  buildingName: string;
  unitNo: string;
  floor: number;
  totalFloors: number;
  locality: string;
  city: string;
  address: string;
  ownerName: string;
  ownerPhone: string;
  priceInr: number;
  carpetAreaSqft: number;
  amenities: string[];
};

export default function PropertyFormPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { data: master } = useMasterDataQuery();
  const [create, { isLoading }] = useCreateMutation();
  const [dupWarn, setDupWarn] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [blockedPath, setBlockedPath] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(propertyCreateSchema as never),
    defaultValues: {
      title: '',
      listingType: 'Sale',
      propertyType: 'Apartment',
      bhk: 2,
      furnishing: 'Semi-Furnished',
      status: 'Draft',
      buildingName: '',
      unitNo: '',
      floor: 1,
      totalFloors: 10,
      locality: '',
      city: 'Mumbai',
      address: '',
      ownerName: '',
      ownerPhone: '',
      priceInr: 0,
      carpetAreaSqft: 0,
      amenities: [],
    },
  });

  useEffect(() => setDirty(isDirty), [isDirty]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (confirmLeave) return false;
    return dirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setBlockedPath(blocker.location.pathname);
      setConfirmLeave(true);
    }
  }, [blocker.state]);

  const listingType = watch('listingType');
  const price = Number(watch('priceInr') || 0);
  const area = Number(watch('carpetAreaSqft') || 0);
  const pps = pricePerSqft(price, area);

  const localities = (master?.data ?? []).filter((m) => m.kind === 'LOCALITY' && m.active);
  const amenitiesList = (master?.data ?? []).filter((m) => m.kind === 'AMENITY' && m.active);
  const types = (master?.data ?? []).filter((m) => m.kind === 'PROPERTY_TYPE' && m.active);

  const onSubmit = async (values: FormValues) => {
    try {
      const created = await create(values as unknown as Record<string, unknown>).unwrap();
      setDirty(false);
      dispatch(showSnack({ message: 'Property created', severity: 'success' }));
      navigate(`/properties/${created.id}`);
    } catch (e) {
      const code = apiErrorCode(e);
      const fields = apiErrorDetails(e)?.fields as Array<{ path: string; message: string }> | undefined;
      if (code === 'CONFLICT' || code === 'DUPLICATE') {
        setDupWarn('This building + unit already exists (server rejected the duplicate).');
      } else if (fields) {
        setDupWarn(fields.map((f) => `${f.path}: ${f.message}`).join(' · '));
      } else {
        setDupWarn(apiErrorMessage(e, 'Create failed'));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} noValidate>
      <Typography variant="h5" fontWeight={800} mb={2}>
        New property
      </Typography>
      {dupWarn && <Alert severity="error" sx={{ mb: 2 }}>{dupWarn}</Alert>}

      <Stack spacing={2} maxWidth={880}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>1 · Basics</Typography>
            <Stack spacing={2}>
              <Controller name="title" control={control} render={({ field }) => (
                <TextField {...field} label="Title" fullWidth error={!!errors.title} helperText={errors.title?.message} />
              )} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Controller name="propertyType" control={control} render={({ field }) => (
                  <FormControl fullWidth size="small" error={!!errors.propertyType}>
                    <InputLabel>Property type</InputLabel>
                    <Select {...field} label="Property type">
                      {(types.length ? types.map((t) => t.value) : ['Apartment', 'Villa', 'Plot', 'Commercial']).map((t) => (
                        <MenuItem key={t} value={t}>{t}</MenuItem>
                      ))}
                    </Select>
                    {errors.propertyType && <FormHelperText>{errors.propertyType.message}</FormHelperText>}
                  </FormControl>
                )} />
                <Controller name="listingType" control={control} render={({ field }) => (
                  <FormControl fullWidth size="small">
                    <InputLabel>Sale / Rent</InputLabel>
                    <Select {...field} label="Sale / Rent">
                      <MenuItem value="Sale">Sale</MenuItem>
                      <MenuItem value="Rent">Rent</MenuItem>
                    </Select>
                  </FormControl>
                )} />
                <Controller name="bhk" control={control} render={({ field }) => (
                  <FormControl fullWidth size="small">
                    <InputLabel>BHK</InputLabel>
                    <Select {...field} label="BHK">
                      {[0, 1, 2, 3, 4, 5].map((b) => <MenuItem key={b} value={b}>{b === 0 ? 'N/A' : b}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Controller name="furnishing" control={control} render={({ field }) => (
                  <FormControl fullWidth size="small">
                    <InputLabel>Furnishing</InputLabel>
                    <Select {...field} label="Furnishing">
                      {['Unfurnished', 'Semi-Furnished', 'Furnished'].map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
                <Controller name="status" control={control} render={({ field }) => (
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select {...field} label="Status">
                      {['Draft', 'Listed', 'SiteVisit', 'Negotiation', 'Closed', 'Withdrawn'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>2 · Location</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller name="buildingName" control={control} render={({ field }) => (
                <TextField {...field} label="Building" fullWidth size="small" error={!!errors.buildingName} helperText={errors.buildingName?.message} />
              )} />
              <Controller name="unitNo" control={control} render={({ field }) => (
                <TextField {...field} label="Unit" fullWidth size="small" sx={{ maxWidth: 160 }} error={!!errors.unitNo} helperText={errors.unitNo?.message} />
              )} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
              <Controller name="floor" control={control} render={({ field }) => (
                <TextField {...field} label="Floor" type="number" size="small" fullWidth error={!!errors.floor} helperText={errors.floor?.message} />
              )} />
              <Controller name="totalFloors" control={control} render={({ field }) => (
                <TextField {...field} label="Total floors" type="number" size="small" fullWidth error={!!errors.totalFloors} helperText={errors.totalFloors?.message} />
              )} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
              <Controller name="locality" control={control} render={({ field }) => (
                <FormControl fullWidth size="small" error={!!errors.locality}>
                  <InputLabel>Locality</InputLabel>
                  <Select {...field} label="Locality">
                    {(localities.length ? localities.map((l) => l.value) : ['Powai', 'Bandra West']).map((l) => (
                      <MenuItem key={l} value={l}>{l}</MenuItem>
                    ))}
                  </Select>
                  {errors.locality && <FormHelperText>{errors.locality.message}</FormHelperText>}
                </FormControl>
              )} />
              <Controller name="city" control={control} render={({ field }) => (
                <TextField {...field} label="City" fullWidth size="small" error={!!errors.city} helperText={errors.city?.message} />
              )} />
            </Stack>
            <Controller name="address" control={control} render={({ field }) => (
              <TextField {...field} label="Address" fullWidth size="small" multiline minRows={2} sx={{ mt: 2 }} />
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>3 · Pricing & size</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller name="priceInr" control={control} render={({ field }) => (
                <TextField {...field} label={listingType === 'Rent' ? 'Monthly rent (₹)' : 'Price (₹)'} type="number" fullWidth size="small" error={!!errors.priceInr} helperText={errors.priceInr?.message ?? (price > 0 ? formatINR(price) : ' ')} />
              )} />
              <Controller name="carpetAreaSqft" control={control} render={({ field }) => (
                <TextField {...field} label="Carpet area (sqft)" type="number" fullWidth size="small" error={!!errors.carpetAreaSqft} helperText={errors.carpetAreaSqft?.message} />
              )} />
              <TextField label="Price / sqft" size="small" fullWidth value={pps ? `₹${pps.toLocaleString('en-IN')}` : '—'} InputProps={{ readOnly: true }} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>4 · Owner</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller name="ownerName" control={control} render={({ field }) => (
                <TextField {...field} label="Owner name" fullWidth size="small" error={!!errors.ownerName} helperText={errors.ownerName?.message} />
              )} />
              <Controller name="ownerPhone" control={control} render={({ field }) => (
                <TextField {...field} label="Owner mobile (India)" fullWidth size="small" placeholder="9830012321" error={!!errors.ownerPhone} helperText={errors.ownerPhone?.message} />
              )} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>5 · Amenities</Typography>
            <Controller name="amenities" control={control} render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>Amenities</InputLabel>
                <Select {...field} multiple label="Amenities" renderValue={(sel: string[]) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {sel.map((v) => <Chip key={v} label={v} size="small" />)}
                  </Stack>
                )}>
                  {amenitiesList.map((a) => (
                    <MenuItem key={a.id} value={a.value}>{a.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )} />
          </CardContent>
        </Card>

        <Stack direction="row" justifyContent="flex-end" spacing={1} pb={4}>
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? <CircularProgress size={22} /> : 'Create property'}
          </Button>
        </Stack>
      </Stack>

      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)}>
        <DialogTitle>Leave with unsaved changes?</DialogTitle>
        <DialogContent>
          <Typography>Your changes have not been saved.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmLeave(false); blocker.reset?.(); }}>Stay</Button>
          <Button
            color="warning"
            onClick={() => {
              setDirty(false);
              setConfirmLeave(false);
              if (blockedPath) navigate(blockedPath);
            }}
          >
            Leave
          </Button>
        </DialogActions>
      </Dialog>
      <span style={{ display: 'none' }}>{user?.role}</span>
    </form>
  );
}
