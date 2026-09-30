import { Router } from 'express';
import { masterDataCreateSchema, masterDataUpdateSchema } from '@propflow/shared';
import { authenticate, tenantScope, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ah } from '../util/async-handler.js';
import { ApiError } from '../util/errors.js';
import { getMasterData, createMasterDataItem, updateMasterDataItem, deleteMasterDataItem } from '../services/master-data-service.js';

export const masterDataRouter = Router();
masterDataRouter.use(authenticate, tenantScope);

masterDataRouter.get(
  '/',
  ah(async (req, res) => {
    const items = await getMasterData(req.user.tid, req.query.kind ?? null);
    res.json({ data: items.map(serialize) });
  }),
);

masterDataRouter.post(
  '/',
  authorize('masterdata:manage'),
  validateBody(masterDataCreateSchema),
  ah(async (req, res) => {
    const item = await createMasterDataItem(req.user.tid, req.body);
    res.status(201).json(serialize(item));
  }),
);

masterDataRouter.patch(
  '/:id',
  authorize('masterdata:manage'),
  validateBody(masterDataUpdateSchema),
  ah(async (req, res) => {
    const item = await updateMasterDataItem(req.user.tid, req.params.id, req.body);
    res.json(serialize(item));
  }),
);

masterDataRouter.delete(
  '/:id',
  authorize('masterdata:manage'),
  ah(async (req, res) => {
    await deleteMasterDataItem(req.user.tid, req.params.id);
    res.status(204).send();
  }),
);

function serialize(item) {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    value: item.value,
    sortOrder: item.sortOrder,
    active: item.active,
  };
}

void ApiError;
