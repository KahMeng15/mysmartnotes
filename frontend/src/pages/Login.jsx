import { useState } from 'react';
import {
  TextInput,
  PasswordInput,
  Checkbox,
  Anchor,
  Paper,
  Title,
  Text,
  Container,
  Group,
  Button,
  Divider,
  Stack,
} from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { fetchApi, setAuthToken } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [panel, setPanel] = useState('login'); // 'login', 'register', 'forgot'
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to login');
      }
      
      if (data.access_token) {
        setAuthToken(data.access_token);
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        
        try {
          const userProfile = await fetchApi('/auth/me');
          localStorage.setItem('user', JSON.stringify(userProfile));
        } catch (err) {
          console.error("Failed to fetch full profile", err);
        }
        
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome to MySmartNotes</Title>
      
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {panel === 'login' && (
          <form onSubmit={handleLogin}>
            {error && <Text color="red" size="sm" mb="sm">{error}</Text>}
            <TextInput 
              label="Email" 
              placeholder="you@email.com" 
              required 
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput 
              label="Password" 
              placeholder="Your password" 
              required 
              mt="md" 
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Group justify="space-between" mt="lg">
              <Checkbox label="Remember me" />
              <Anchor component="button" type="button" size="sm" onClick={() => setPanel('forgot')}>
                Forgot password?
              </Anchor>
            </Group>
            <Button fullWidth mt="xl" type="submit" loading={loading}>
              Sign in
            </Button>
            
            <Group justify="center" mt="md">
              <Text size="sm" c="dimmed">Don't have an account?</Text>
              <Anchor component="button" type="button" size="sm" onClick={() => setPanel('register')}>
                Register
              </Anchor>
            </Group>

            <Divider label="Or continue with" labelPosition="center" my="lg" />

            <Button fullWidth variant="default" leftSection={<IconBrandGoogle size={16} />}>
              Sign in with Google
            </Button>
          </form>
        )}

        {panel === 'register' && (
          <form>
            <Stack>
              <TextInput required label="Nickname" placeholder="What should we call you?" />
              <TextInput required label="Full Name" placeholder="Your full name" />
              <TextInput required label="Email" placeholder="hello@email.com" />
              <PasswordInput required label="Password" placeholder="Your password" />
              <Checkbox label="I agree to the Terms of Service and Privacy Policy" />
            </Stack>

            <Button fullWidth mt="xl" type="submit">
              Create Account
            </Button>
            
            <Group justify="center" mt="md">
              <Text size="sm" c="dimmed">Already have an account?</Text>
              <Anchor component="button" type="button" size="sm" onClick={() => setPanel('login')}>
                Login
              </Anchor>
            </Group>
          </form>
        )}

        {panel === 'forgot' && (
          <form>
            <Text size="sm" c="dimmed" mb="md">
              Enter your email address and we will send you a link to reset your password.
            </Text>
            <TextInput required label="Email" placeholder="you@email.com" />

            <Button fullWidth mt="xl" type="submit">
              Send Reset Link
            </Button>
            
            <Group justify="center" mt="md">
              <Anchor component="button" type="button" size="sm" onClick={() => setPanel('login')}>
                Back to Login
              </Anchor>
            </Group>
          </form>
        )}
      </Paper>
    </Container>
  );
}
