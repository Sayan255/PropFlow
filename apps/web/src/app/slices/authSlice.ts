import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Role } from '@propflow/shared';

interface AuthState {
  accessToken: string | null;
  user: { id: string; email: string; name: string; role: Role; tenantId: string | null } | null;
  expiresAt: number | null;
}

const initialState: AuthState = { accessToken: null, user: null, expiresAt: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    credentialsReceived(
      state,
      action: PayloadAction<{
        accessToken: string;
        user: AuthState['user'];
        expiresIn?: number;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user ?? null;
      state.expiresAt = action.payload.expiresIn ? Date.now() + action.payload.expiresIn * 1000 : null;
    },
    tokenRefreshed(state, action: PayloadAction<{ accessToken: string; user?: AuthState['user'] }>) {
      state.accessToken = action.payload.accessToken;
      if (action.payload.user) state.user = action.payload.user;
      state.expiresAt = Date.now() + 60_000;
    },
    authCleared(state) {
      state.accessToken = null;
      state.user = null;
      state.expiresAt = null;
    },
  },
});

export const { credentialsReceived, tokenRefreshed, authCleared } = authSlice.actions;
export default authSlice.reducer;

/** Bridge: baseQuery dispatches a window event on successful refresh; store subscribes once. */
export function installTokenBridge(dispatch: (a: unknown) => void) {
  window.addEventListener('pf:token', (evt) => {
    const detail = (evt as CustomEvent).detail as { accessToken: string; user?: unknown };
    if (detail?.accessToken) dispatch(tokenRefreshed(detail as never));
  });
  window.addEventListener('pf:auth-expired', () => {
    dispatch(authCleared());
  });
}
