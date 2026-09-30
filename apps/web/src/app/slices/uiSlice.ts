import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Snack {
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
}

interface UiState {
  mode: 'light' | 'dark';
  sidebarOpen: boolean;
  snack: Snack | null;
  columnVisibility: Record<string, boolean>;
}

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const initialState: UiState = {
  mode: prefersDark ? 'dark' : 'light',
  sidebarOpen: true,
  snack: null,
  columnVisibility: {},
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleMode(state) {
      state.mode = state.mode === 'light' ? 'dark' : 'light';
    },
    setSidebar(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    showSnack(state, action: PayloadAction<Snack>) {
      state.snack = action.payload;
    },
    clearSnack(state) {
      state.snack = null;
    },
    setColumnVisibility(state, action: PayloadAction<Record<string, boolean>>) {
      state.columnVisibility = action.payload;
    },
  },
});

export const { toggleMode, setSidebar, showSnack, clearSnack, setColumnVisibility } = uiSlice.actions;
export default uiSlice.reducer;
