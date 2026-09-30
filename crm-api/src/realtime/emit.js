import { io } from './io.js';

export function emitPropertyUpdated(tenantId, payload) {
  io?.to(`tenant:${tenantId}`).emit('property:updated', payload);
}

export function emitVisitReminder(userIds, payload) {
  for (const uid of userIds) {
    io?.to(`user:${uid}`).emit('visit:reminder', payload);
  }
}

/** Joins the tenant broadcast room after authorizing the user's tenant. */
export function joinTenantRoom(socket, tenantId) {
  socket.join(`tenant:${tenantId}`);
}
