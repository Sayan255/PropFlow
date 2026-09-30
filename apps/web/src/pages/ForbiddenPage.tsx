import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { DEFAULT_LANDING_BY_ROLE } from '@propflow/shared';
import { useAppSelector } from '../app/hooks';

export default function ForbiddenPage() {
  const user = useAppSelector((s) => s.auth.user);
  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center">
      <Card>
        <CardContent sx={{ p: 5, textAlign: 'center' }}>
          <Typography variant="h2" fontWeight={900} color="error">
            403
          </Typography>
          <Typography variant="h6" gutterBottom>
            Forbidden — You do not have permission to access this page.
          </Typography>
          <Button component={RouterLink} to={user ? DEFAULT_LANDING_BY_ROLE[user.role] : '/login'} variant="contained" sx={{ mt: 2 }}>
            Back to home
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
