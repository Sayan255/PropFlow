import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { store } from './app/store';
import { useColorMode } from './app/hooks';
import App from './App';
import './theme.css';

const RouterCmp = BrowserRouter;

function ThemedApp() {
  const { mode } = useColorMode();
  const theme = createTheme(getTheme(mode));
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

function getTheme(mode: 'light' | 'dark') {
  return {
    palette: {
      mode,
      primary: { main: mode === 'light' ? '#0f62fe' : '#78a9ff' },
      secondary: { main: '#ee6c4d' },
      background: mode === 'light' ? { default: '#f7f8fa', paper: '#ffffff' } : { default: '#0b0e14', paper: '#12161f' },
      divider: mode === 'light' ? '#e4e7ec' : '#232a36',
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true } },
    },
  } as const;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <RouterCmp>
        <ThemedApp />
      </RouterCmp>
    </Provider>
  </React.StrictMode>,
);
