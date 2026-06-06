import { useState, useEffect } from 'react';
import {
  TextInput,
  PasswordInput,
  Checkbox,
  Anchor,
  Text,
  Group,
  Button,
  Stack,
  Flex,
  Box,
  Title
} from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { fetchApi, setAuthToken } from '../lib/api';

const quotes = [
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "Malcolm X" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Don't let what you cannot do interfere with what you can do.", author: "John Wooden" }
];

export default function Login() {
  const navigate = useNavigate();
  const [panel, setPanel] = useState('login'); // 'login', 'register', 'forgot'
  const [quote, setQuote] = useState(quotes[0]);
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
  }, []);

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
    <Flex h="100vh" bg="#fff" p={0}>
      
      {/* Left Side: Quotes & Gradient */}
      <Box 
        visibleFrom="md"
        style={{ 
          width: '58%', 
          background: 'linear-gradient(160deg, #171738 0%, #593C8F 55%, #8EF9F3 100%)',
          margin: '1.5rem',
          borderRadius: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <Box style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column' }}>
          <Group align="flex-start" wrap="nowrap" gap="sm" mb="lg">
            <Text 
              ff="Instrument Serif, serif" 
              c="rgba(255, 255, 255, 0.4)" 
              style={{ fontSize: '5rem', lineHeight: 0.8, marginTop: '5px' }}
            >
              "
            </Text>
            <Text 
              ff="Instrument Serif, serif" 
              fs="italic" 
              c="#fff" 
              style={{ fontSize: '4.5rem', lineHeight: 0.9, flex: 1 }}
            >
              {quote.text}
            </Text>
            <Text 
              ff="Instrument Serif, serif" 
              c="rgba(255, 255, 255, 0.4)" 
              style={{ fontSize: '5rem', lineHeight: 0.8, alignSelf: 'flex-end', marginBottom: '-15px' }}
            >
              "
            </Text>
          </Group>
          <Text 
            ff="Instrument Sans, sans-serif" 
            c="#fff" 
            fw={500} 
            style={{ fontSize: '2rem', alignSelf: 'flex-end', opacity: 0.9 }}
          >
            {quote.author}
          </Text>
        </Box>
      </Box>

      {/* Right Side: Auth Forms */}
      <Box 
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          padding: '60px 8%',
          backgroundColor: '#fff' 
        }}
      >
        <Title 
          order={1} 
          mb={40} 
          fw={800} 
          style={{ fontSize: '3rem', lineHeight: 1.1, color: '#171738' }}
        >
          my<br/>smart<br/>notes
        </Title>

        {panel === 'login' && (
          <form onSubmit={handleLogin}>
            {error && <Text color="red" size="sm" mb="sm">{error}</Text>}
            <Stack spacing="md">
              <TextInput 
                label="Email" 
                placeholder="you@email.com" 
                required 
                size="md"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
              <PasswordInput 
                label="Password" 
                placeholder="••••••••" 
                required 
                size="md"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
            </Stack>

            <Group mt="xl" grow>
              <Button size="md" type="submit" loading={loading} style={{ backgroundColor: '#171738' }}>
                Log In
              </Button>
              <Button 
                size="md" 
                variant="outline" 
                color="gray" 
                leftSection={<IconBrandGoogle size={20} />}
                style={{ color: '#171738', borderColor: '#ccc' }}
              >
                Log in with Google
              </Button>
            </Group>

            <Group mt="lg" spacing="xs">
              <Text size="sm" c="dimmed">Don't have an account?</Text>
              <Anchor component="button" type="button" size="sm" fw={600} onClick={() => setPanel('register')}>
                Sign up
              </Anchor>
            </Group>
            <Group mt={5}>
              <Anchor component="button" type="button" size="sm" c="blue" onClick={() => setPanel('forgot')}>
                Forgot password?
              </Anchor>
            </Group>
          </form>
        )}

        {panel === 'register' && (
          <form>
            <Text size="sm" fw={500} c="dimmed" mb="xs">Quick Sign Up</Text>
            <Button 
              fullWidth 
              size="md" 
              variant="outline" 
              color="gray" 
              leftSection={<IconBrandGoogle size={20} />}
              mb="xl"
              style={{ color: '#171738', borderColor: '#ccc' }}
            >
              Sign up with Google
            </Button>

            <Text size="sm" fw={500} c="dimmed" mb="md">Or Sign Up Manually</Text>
            <Stack spacing="md">
              <TextInput required label="Nickname" placeholder="What should we call you?" size="md" />
              <TextInput required label="Full Name" placeholder="Your full name" size="md" />
              <TextInput required label="Email" placeholder="you@email.com" size="md" />
              <PasswordInput required label="Password" placeholder="••••••••" size="md" />
            </Stack>

            <Box mt="xl" p="md" bg="gray.0" style={{ border: '1px solid #ddd', borderRadius: '4px' }}>
              <Text fw={600} size="sm" mb="sm">I agree to:</Text>
              <Stack gap="xs">
                <Checkbox label={<Anchor href="#" size="sm">Terms of Service</Anchor>} />
                <Checkbox label={<Anchor href="#" size="sm">Privacy Policy</Anchor>} />
                <Checkbox label={<Anchor href="#" size="sm">Fair Use Policy</Anchor>} />
              </Stack>
            </Box>

            <Button fullWidth size="md" mt="xl" type="submit" style={{ backgroundColor: '#171738' }}>
              Create Account
            </Button>
            
            <Group mt="md">
              <Text size="sm" c="dimmed">Already have an account?</Text>
              <Anchor component="button" type="button" size="sm" fw={600} onClick={() => setPanel('login')}>
                Log in
              </Anchor>
            </Group>
          </form>
        )}

        {panel === 'forgot' && (
          <form>
            <Text size="md" c="dimmed" mb="lg">
              Enter your email address and we will send you a link to reset your password.
            </Text>
            <TextInput required label="Email" placeholder="you@email.com" size="md" mb="xl" />

            <Button fullWidth size="md" type="submit" style={{ backgroundColor: '#171738' }}>
              Send Reset Link
            </Button>
            
            <Group mt="xl">
              <Anchor component="button" type="button" size="sm" fw={600} onClick={() => setPanel('login')}>
                Back to Login
              </Anchor>
            </Group>
          </form>
        )}

      </Box>
    </Flex>
  );
}
