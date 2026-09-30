import { configureStore } from '@reduxjs/toolkit';
import { authApi } from './api/authApi';
import { propertiesApi } from './api/propertiesApi';
import { masterDataApi } from './api/miscApis';
import { siteVisitsApi } from './api/miscApis';
import { dashboardApi } from './api/miscApis';
import { platformApi } from './api/miscApis';
import auth from './slices/authSlice';
import ui from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    [authApi.reducerPath]: authApi.reducer,
    [propertiesApi.reducerPath]: propertiesApi.reducer,
    [masterDataApi.reducerPath]: masterDataApi.reducer,
    [siteVisitsApi.reducerPath]: siteVisitsApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [platformApi.reducerPath]: platformApi.reducer,
    auth,
    ui,
  },
  middleware: (getDefault) => getDefault().concat(authApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
