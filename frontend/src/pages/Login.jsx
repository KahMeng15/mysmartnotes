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
  Title,
  Alert,
  Divider,
} from '@mantine/core';
import { IconBrandGoogle, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApi, setAuthToken } from '../lib/api';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const quotes = [
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "Malcolm X" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Don't let what you cannot do interfere with what you can do.", author: "John Wooden" }
];

// Cache Firebase app instance
let _firebaseAuth = null;

async function getFirebaseAuth() {
  if (_firebaseAuth) return _firebaseAuth;
  const config = await fetch('/api/auth/firebase-config').then(r => r.json());
  const app = initializeApp(config);
  _firebaseAuth = getAuth(app);
  return _firebaseAuth;
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [panel, setPanel] = useState('login'); // 'login' | 'register' | 'forgot' | 'google-complete' | 'verify'

  const [quote, setQuote] = useState(quotes[0]);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regNickname, setRegNickname] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeFairUse, setAgreeFairUse] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');

  // Google "complete profile" state
  const [googleIdToken, setGoogleIdToken] = useState(null);
  const [googleNickname, setGoogleNickname] = useState('');
  const [googleFullName, setGoogleFullName] = useState('');
  const [googleAgreeTos, setGoogleAgreeTos] = useState(false);
  const [googleAgreePrivacy, setGoogleAgreePrivacy] = useState(false);
  const [googleAgreeFairUse, setGoogleAgreeFairUse] = useState(false);

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

    // Auto-handle email verification token in URL
    const verifyToken = searchParams.get('verify_token');
    if (verifyToken) {
      setPanel('verify');
      fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.detail && !data.access_token) {
            setError(data.detail);
          } else {
            setSuccess('✅ Email verified! You can now log in.');
          }
        })
        .catch(() => setError('Verification request failed.'))
        .finally(() => setPanel('login'));
    }
  }, []);

  const switchPanel = (p) => {
    setError(null);
    setSuccess(null);
    setPanel(p);
  };

  const handleAuthSuccess = async (data) => {
    setAuthToken(data.access_token);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    try {
      const userProfile = await fetchApi('/auth/me');
      localStorage.setItem('user', JSON.stringify(userProfile));
    } catch {}
    navigate('/dashboard');
  };

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to login');
      await handleAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── GOOGLE SIGN-IN ─────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const res = await fetch('/api/auth/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || 'Google sign-in failed');

      if (data.is_new_user) {
        // Need profile completion
        setGoogleIdToken(idToken);
        setGoogleFullName(data.full_name || '');
        setGoogleNickname(data.suggested_nickname || '');
        switchPanel('google-complete');
      } else {
        await handleAuthSuccess(data);
      }
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Google sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── GOOGLE COMPLETE PROFILE ────────────────────────────────────────────────
  const handleGoogleComplete = async (e) => {
    e.preventDefault();
    if (!googleAgreeTos || !googleAgreePrivacy || !googleAgreeFairUse) {
      setError('You must agree to all policies to register.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/google-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: googleIdToken,
          nickname: googleNickname,
          full_name: googleFullName,
          agree_tos: googleAgreeTos,
          agree_privacy: googleAgreePrivacy,
          agree_fair_use: googleAgreeFairUse,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Profile completion failed');
      await handleAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── REGISTER ───────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!agreeTos || !agreePrivacy || !agreeFairUse) {
      setError('You must agree to all policies to register.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          nickname: regNickname,
          full_name: regFullName,
          agree_tos: agreeTos,
          agree_privacy: agreePrivacy,
          agree_fair_use: agreeFairUse,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.detail)
          ? data.detail.map(d => d.msg).join(', ')
          : data.detail || 'Registration failed';
        throw new Error(msg);
      }
      setSuccess('Account created! Please check your email to verify your address before logging in.');
      switchPanel('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── FORGOT PASSWORD ────────────────────────────────────────────────────────
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      setSuccess('If that email is registered, a reset link has been sent.');
      switchPanel('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const PolicyCheckboxes = ({ agreeTos, setAgreeTos, agreePrivacy, setAgreePrivacy, agreeFairUse, setAgreeFairUse, prefix = '' }) => (
    <Box mt="md" p="md" bg="gray.0" style={{ border: '1px solid #ddd', borderRadius: '4px' }}>
      <Text fw={600} size="sm" mb="sm">I agree to:</Text>
      <Stack gap="xs">
        <Checkbox
          id={`${prefix}agree-tos`}
          checked={agreeTos}
          onChange={(e) => setAgreeTos(e.currentTarget.checked)}
          label={<Anchor href="#" size="sm">Terms of Service</Anchor>}
        />
        <Checkbox
          id={`${prefix}agree-privacy`}
          checked={agreePrivacy}
          onChange={(e) => setAgreePrivacy(e.currentTarget.checked)}
          label={<Anchor href="#" size="sm">Privacy Policy</Anchor>}
        />
        <Checkbox
          id={`${prefix}agree-fair-use`}
          checked={agreeFairUse}
          onChange={(e) => setAgreeFairUse(e.currentTarget.checked)}
          label={<Anchor href="#" size="sm">Fair Use Policy</Anchor>}
        />
      </Stack>
    </Box>
  );

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
            <Text ff="Instrument Serif, serif" c="rgba(255, 255, 255, 0.4)" style={{ fontSize: '5rem', lineHeight: 0.8, marginTop: '5px' }}>
              "
            </Text>
            <Text ff="Instrument Serif, serif" fs="italic" c="#fff" style={{ fontSize: '4.5rem', lineHeight: 0.9, flex: 1 }}>
              {quote.text}
            </Text>
            <Text ff="Instrument Serif, serif" c="rgba(255, 255, 255, 0.4)" style={{ fontSize: '5rem', lineHeight: 0.8, alignSelf: 'flex-end', marginBottom: '-15px' }}>
              "
            </Text>
          </Group>
          <Text ff="Instrument Sans, sans-serif" c="#fff" fw={500} style={{ fontSize: '2rem', alignSelf: 'flex-end', opacity: 0.9 }}>
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
            padding: '32px 5%',
            backgroundColor: '#fff',
            overflowY: 'auto',
          }}
        >
          <Box style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
            <Title order={1} mb={40} fw={800} style={{ fontSize: 'clamp(2rem, 10vw, 3rem)', lineHeight: 1.1, color: '#171738' }}>
              my<br />smart<br />notes
            </Title>

          {/* Global alerts */}
          {success && (
            <Alert icon={<IconCheck size={16} />} color="teal" mb="md" withCloseButton onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md" withCloseButton onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* ── LOGIN ── */}
          {panel === 'login' && (
            <form onSubmit={handleLogin}>
              <Stack gap="md">
                <TextInput
                  id="login-email"
                  label="Email"
                  placeholder="you@email.com"
                  required
                  size="md"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                />
                <PasswordInput
                  id="login-password"
                  label="Password"
                  placeholder="••••••••"
                  required
                  size="md"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                />
              </Stack>

              <Button id="btn-login" fullWidth size="md" type="submit" loading={loading} mt="xl" style={{ backgroundColor: '#171738' }}>
                Log In
              </Button>

              <Divider label="or" labelPosition="center" my="md" />

              <Button
                id="btn-google-login"
                fullWidth
                size="md"
                variant="outline"
                color="gray"
                leftSection={<IconBrandGoogle size={20} />}
                style={{ color: '#171738', borderColor: '#ccc' }}
                loading={loading}
                type="button"
                onClick={handleGoogleSignIn}
              >
                Continue with Google
              </Button>

              <Group mt="lg" gap="xs">
                <Text size="sm" c="dimmed">Don't have an account?</Text>
                <Anchor component="button" type="button" size="sm" fw={600} onClick={() => switchPanel('register')}>
                  Sign up
                </Anchor>
              </Group>
              <Group mt={5}>
                <Anchor component="button" type="button" size="sm" c="blue" onClick={() => switchPanel('forgot')}>
                  Forgot password?
                </Anchor>
              </Group>
            </form>
          )}

          {/* ── REGISTER ── */}
          {panel === 'register' && (
            <form onSubmit={handleRegister}>
              <Button
                id="btn-google-signup"
                fullWidth
                size="md"
                variant="outline"
                color="gray"
                leftSection={<IconBrandGoogle size={20} />}
                mb="md"
                style={{ color: '#171738', borderColor: '#ccc' }}
                loading={loading}
                type="button"
                onClick={handleGoogleSignIn}
              >
                Sign up with Google
              </Button>

              <Divider label="or sign up manually" labelPosition="center" mb="md" />

              <Stack gap="md">
                <TextInput
                  id="reg-nickname"
                  required
                  label="Nickname"
                  placeholder="What should we call you?"
                  size="md"
                  value={regNickname}
                  onChange={(e) => setRegNickname(e.currentTarget.value)}
                />
                <TextInput
                  id="reg-fullname"
                  label="Full Name"
                  placeholder="Your full name"
                  size="md"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.currentTarget.value)}
                />
                <TextInput
                  id="reg-email"
                  required
                  label="Email"
                  placeholder="you@email.com"
                  size="md"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.currentTarget.value)}
                />
                <PasswordInput
                  id="reg-password"
                  required
                  label="Password"
                  placeholder="••••••••"
                  size="md"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.currentTarget.value)}
                />
              </Stack>

              <PolicyCheckboxes
                agreeTos={agreeTos} setAgreeTos={setAgreeTos}
                agreePrivacy={agreePrivacy} setAgreePrivacy={setAgreePrivacy}
                agreeFairUse={agreeFairUse} setAgreeFairUse={setAgreeFairUse}
                prefix="reg-"
              />

              <Button id="btn-register" fullWidth size="md" mt="xl" type="submit" loading={loading} style={{ backgroundColor: '#171738' }}>
                Create Account
              </Button>

              <Group mt="md">
                <Text size="sm" c="dimmed">Already have an account?</Text>
                <Anchor component="button" type="button" size="sm" fw={600} onClick={() => switchPanel('login')}>
                  Log in
                </Anchor>
              </Group>
            </form>
          )}

          {/* ── GOOGLE COMPLETE PROFILE ── */}
          {panel === 'google-complete' && (
            <form onSubmit={handleGoogleComplete}>
              <Text size="md" fw={600} mb="sm" c="#171738">Complete your profile</Text>
              <Text size="sm" c="dimmed" mb="lg">
                Just a few more details to get you started with Google sign-in.
              </Text>
              <Stack gap="md">
                <TextInput
                  id="gc-nickname"
                  required
                  label="Nickname"
                  placeholder="What should we call you?"
                  size="md"
                  value={googleNickname}
                  onChange={(e) => setGoogleNickname(e.currentTarget.value)}
                />
                <TextInput
                  id="gc-fullname"
                  label="Full Name"
                  placeholder="Your full name"
                  size="md"
                  value={googleFullName}
                  onChange={(e) => setGoogleFullName(e.currentTarget.value)}
                />
              </Stack>

              <PolicyCheckboxes
                agreeTos={googleAgreeTos} setAgreeTos={setGoogleAgreeTos}
                agreePrivacy={googleAgreePrivacy} setAgreePrivacy={setGoogleAgreePrivacy}
                agreeFairUse={googleAgreeFairUse} setAgreeFairUse={setGoogleAgreeFairUse}
                prefix="gc-"
              />

              <Button id="btn-gc-submit" fullWidth size="md" mt="xl" type="submit" loading={loading} style={{ backgroundColor: '#171738' }}>
                Finish Sign Up
              </Button>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {panel === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <Text size="md" c="dimmed" mb="lg">
                Enter your email address and we will send you a link to reset your password.
              </Text>
              <TextInput
                id="forgot-email"
                required
                label="Email"
                placeholder="you@email.com"
                size="md"
                mb="xl"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.currentTarget.value)}
              />
              <Button id="btn-reset" fullWidth size="md" type="submit" loading={loading} style={{ backgroundColor: '#171738' }}>
                Send Reset Link
              </Button>
              <Group mt="xl">
                <Anchor component="button" type="button" size="sm" fw={600} onClick={() => switchPanel('login')}>
                  Back to Login
                </Anchor>
              </Group>
            </form>
          )}
        </Box>
      </Box>
    </Flex>
  );
}
