import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Chip, IconButton, InputBase, Paper, Stack, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import { io, type Socket } from 'socket.io-client';
import { useAppSelector } from '../app/hooks';
import { doRefresh } from '../app/baseQueryWithReauth';

interface Msg {
  id?: string;
  clientMsgId: string;
  userId: string;
  body: string;
  createdAt?: string;
  state: 'sending' | 'sent' | 'failed';
}

export default function ChatPanel({ propertyId }: { propertyId: string }) {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const me = useAppSelector((s) => s.auth.user);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io({
      path: '/crm-api/socket.io',
      auth: { token: accessToken },
      // crm-api deliberately disables polling; start with its supported transport.
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionError(null);
      setJoined(false);
      socket.emit('property:join', { propertyId }, (res: { ok: boolean; messages?: Omit<Msg, 'state'>[]; online?: string[]; error?: string }) => {
        if (res.ok) {
          setMessages((res.messages ?? []).map((m) => ({ ...m, state: 'sent' })));
          setOnline(res.online ?? []);
          setJoined(true);
        } else {
          setConnectionError(res.error ?? 'Could not join this property chat.');
        }
      });
    });
    socket.on('connect_error', (err: Error) => {
      setJoined(false);
      setConnectionError(`Chat connection failed: ${err.message}`);
      if (err.message === 'unauthorized') void doRefresh();
    });
    socket.on('disconnect', () => setJoined(false));

    socket.on('chat:new', (m: Omit<Msg, 'state'>) => {
      setMessages((prev) => {
        if (prev.some((p) => p.clientMsgId === m.clientMsgId)) {
          return prev.map((p) => (p.clientMsgId === m.clientMsgId ? { ...m, state: 'sent' as const } : p));
        }
        return [...prev, { ...m, state: 'sent' }];
      });
    });

    socket.on('typing', ({ userId, typing: isTyping }: { userId: string; typing: boolean }) => {
      setTyping(isTyping && userId !== me?.id ? userId : null);
    });

    socket.on('presence:update', ({ online: members }: { online: string[] }) => setOnline(members));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setJoined(false);
    };
  }, [accessToken, propertyId, me?.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, typing]);

  const send = (clientMsgId: string, body: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.timeout(5000).emit('chat:send', { propertyId, clientMsgId, body }, (err: unknown, res: { ok: boolean; message?: Omit<Msg, 'state'>; error?: string }) => {
      if (err || !res?.ok) {
        setMessages((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, state: 'failed' } : m)));
        return;
      }
      setMessages((prev) => {
        const exists = prev.some((m) => m.clientMsgId === clientMsgId);
        return exists
          ? prev.map((m) => (m.clientMsgId === clientMsgId ? { ...(res.message ?? m), state: 'sent' as const } : m))
          : [...prev, { ...(res.message ?? { clientMsgId, userId: me?.id ?? '', body }), state: 'sent' }];
      });
    });
  };

  const onSend = () => {
    const body = draft.trim();
    if (!body) return;
    if (!joined || !socketRef.current?.connected) {
      setConnectionError('Chat is connecting. Please try sending again in a moment.');
      return;
    }
    const clientMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { clientMsgId, userId: me?.id ?? '', body, createdAt: new Date().toISOString(), state: 'sending' },
    ]);
    setDraft('');
    send(clientMsgId, body);
  };

  const onlineCount = useMemo(() => online.length, [online]);

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 420 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle1" fontWeight={700}>Chat</Typography>
        <Chip size="small" color={onlineCount > 1 ? 'success' : 'default'} label={joined ? `${onlineCount} online` : 'Connecting…'} />
      </Stack>

      {connectionError && <Alert severity="error" sx={{ mb: 1 }}>{connectionError}</Alert>}

      <Box ref={listRef} sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 }}>
        {messages.map((m) => (
          <Box key={m.clientMsgId} sx={{ py: 0.5, textAlign: m.userId === me?.id ? 'right' : 'left' }}>
            <Box
              sx={{
                display: 'inline-block',
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                bgcolor: m.userId === me?.id ? 'primary.main' : 'action.hover',
                color: m.userId === me?.id ? 'primary.contrastText' : 'text.primary',
                maxWidth: '85%',
              }}
            >
              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{m.body}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }}>
                {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                {m.state === 'sending' && ' · sending…'}
                {m.state === 'failed' && ' · failed'}
              </Typography>
            </Box>
            {m.state === 'failed' && (
              <Tooltip title="Retry">
                <IconButton size="small" onClick={() => send(m.clientMsgId, m.body)}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
        {typing && <Typography variant="caption" color="text.secondary">someone is typing…</Typography>}
      </Box>

      <Stack direction="row" spacing={1} mt={1}>
        <InputBase
          fullWidth
          placeholder={joined ? 'Message…' : 'Connecting to chat…'}
          disabled={!joined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            socketRef.current?.emit('typing', { propertyId, typing: e.target.value.length > 0 });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5, py: 0.5 }}
        />
        <IconButton color="primary" onClick={onSend} disabled={!draft.trim() || !joined}>
          <SendIcon />
        </IconButton>
      </Stack>
    </Paper>
  );
}
