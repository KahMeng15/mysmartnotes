import SummaryView from "./pages/SummaryView";

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { AppShell, Burger, Group, Text, NavLink as MantineNavLink, ScrollArea, ActionIcon, Center, Tooltip, Avatar, Menu, UnstyledButton, Portal, Notification } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconDashboard, 
  IconLogin, 
  IconHome, 
  IconBooks, 
  IconUpload, 
  IconMessageDots, 
  IconBolt, 
  IconSettings,
  IconChartBar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconBook2,
  IconShieldCheck
} from '@tabler/icons-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NotesManager from './pages/NotesManager';
import UploadDocs from './pages/UploadDocs';
import ChatInterface from './pages/ChatInterface';
import ExerciseView from './pages/ExerciseView';
import SubjectView from './pages/SubjectView';
import NoteView from './pages/NoteView';
import Settings from './pages/Settings';
import GroupView from './pages/GroupView';
import AdminPage from './pages/Admin';
import { fetchApi } from './lib/api';

function GlobalToasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleError = (e) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, message: e.detail }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    };
    window.addEventListener('apiError', handleError);
    return () => window.removeEventListener('apiError', handleError);
  }, []);

  return (
    <Portal>
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {toasts.map(t => (
          <Notification key={t.id} title="System Error" color="red" onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            {t.message}
          </Notification>
        ))}
      </div>
    </Portal>
  );
}

function AppLayout({ children }) {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [navOpen, setNavOpen] = useState(true);
  const [user, setUser] = useState(null);
  const location = useLocation();

  useEffect(() => {
    // Only fetch if logged in
    if (localStorage.getItem('token')) {
      fetchApi('/auth/me').then(data => {
        if (data) {
          setUser(data);
          if (data.nav_sidebar_open !== undefined) {
            setNavOpen(data.nav_sidebar_open);
          }
        }
      }).catch(err => console.error("Failed to load user preferences", err));
    }
  }, [location.pathname]);

  const toggleNav = async () => {
    const newState = !navOpen;
    setNavOpen(newState);
    try {
      await fetchApi('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ nav_sidebar_open: newState })
      });
    } catch (e) {
      console.error("Failed to save nav state", e);
    }
  };

  if (location.pathname === '/login' || location.pathname === '/') {
    return <>{children}</>;
  }

  return (
    <AppShell
      navbar={{
        width: navOpen ? 250 : 80,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding={(location.pathname.startsWith('/note/') || location.pathname.startsWith('/resource/') || location.pathname.startsWith('/chat')) ? 0 : "md"}
      bg="#ffffff"
    >
      <AppShell.Navbar p="md" bg="#ffffff" style={{ borderRight: '1px solid #eaeaea', transition: 'width 0.2s ease' }}>
        <Group justify={navOpen ? "space-between" : "center"} mb="xl" style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Group gap="sm" wrap="nowrap" style={{ display: navOpen ? 'flex' : 'none' }}>
            <IconBook2 size={28} color="#171738" />
            <Text size="xl" fw={900} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
              MySmartNotes
            </Text>
          </Group>
          <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
        </Group>

        <AppShell.Section grow component={ScrollArea}>
          <Tooltip label="Dashboard" disabled={navOpen} position="right">
            <MantineNavLink component={NavLink} to="/dashboard" label={navOpen ? "Dashboard" : ""} leftSection={<IconDashboard size="1.2rem" stroke={1.5} />} />
          </Tooltip>
          <Tooltip label="My Notes" disabled={navOpen} position="right">
            <MantineNavLink component={NavLink} to="/mynotes" label={navOpen ? "My Notes" : ""} leftSection={<IconBooks size="1.2rem" stroke={1.5} />} />
          </Tooltip>
          <Tooltip label="Chat" disabled={navOpen} position="right">
            <MantineNavLink component={NavLink} to="/chat" label={navOpen ? "Chat" : ""} leftSection={<IconMessageDots size="1.2rem" stroke={1.5} />} />
          </Tooltip>
          <Tooltip label="Exercises" disabled={navOpen} position="right">
            <MantineNavLink component={NavLink} to="/exercises" label={navOpen ? "Exercises" : ""} leftSection={<IconBolt size="1.2rem" stroke={1.5} />} />
          </Tooltip>
          <Tooltip label="Upload" disabled={navOpen} position="right">
            <MantineNavLink component={NavLink} to="/upload" label={navOpen ? "Upload" : ""} leftSection={<IconUpload size="1.2rem" stroke={1.5} />} />
          </Tooltip>
          {user?.is_admin && (
            <Tooltip label="Admin" disabled={navOpen} position="right">
              <MantineNavLink component={NavLink} to="/admin" label={navOpen ? "Admin" : ""} leftSection={<IconShieldCheck size="1.2rem" stroke={1.5} color="purple" />} />
            </Tooltip>
          )}
        </AppShell.Section>
        
        <AppShell.Section style={{ borderTop: '1px solid #eaeaea', paddingTop: '10px' }}>
          <Group justify={navOpen ? "space-between" : "center"} wrap="nowrap" gap="xs">
            <Menu position="right-end" withArrow>
              <Menu.Target>
                <UnstyledButton p="xs" style={{ borderRadius: '8px', flex: navOpen ? 1 : 'unset', transition: 'background-color 150ms ease' }}>
                  <Group gap="sm" wrap="nowrap">
                    <Avatar radius="xl" color="blue" size="sm">{user ? (user.nickname || user.username || 'U').substring(0, 2).toUpperCase() : 'U'}</Avatar>
                    {navOpen && (
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <Text size="sm" fw={500} truncate>{user?.nickname || user?.username || 'User'}</Text>
                      </div>
                    )}
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item component={NavLink} to="/settings" leftSection={<IconSettings size={14} />}>Settings</Menu.Item>
                <Menu.Item component={NavLink} to="/login" color="red" leftSection={<IconLogin size={14} />} onClick={() => localStorage.removeItem('token')}>Logout</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <ActionIcon variant="subtle" color="gray" onClick={toggleNav} visibleFrom="sm" style={{ display: navOpen ? 'flex' : 'none' }}>
              <IconLayoutSidebarLeftCollapse size={20} />
            </ActionIcon>
          </Group>
          {!navOpen && (
            <Center mt="sm">
              <ActionIcon variant="subtle" color="gray" onClick={toggleNav} visibleFrom="sm">
                <IconLayoutSidebarLeftExpand size={20} />
              </ActionIcon>
            </Center>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
      <GlobalToasts />
    </AppShell>
  );
}



function RootRedirect() {
  const isAuthenticated = !!localStorage.getItem('token');
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/mynotes" element={<NotesManager />} />
          <Route path="/upload" element={<UploadDocs />} />
          <Route path="/chat" element={<ChatInterface />} />
          <Route path="/chat/:cvid" element={<ChatInterface />} />
          <Route path="/exercises" element={<Navigate to="/mynotes" replace />} />
          <Route path="/exercises/:id" element={<ExerciseView />} />
          <Route path="/group/:id" element={<GroupView />} />
          <Route path="/subject/:id" element={<SubjectView />} />
          <Route path="/subject/:id/:tab" element={<SubjectView />} />
          <Route path="/resource/:id" element={<NoteView />} />
          <Route path="/note/:summaryId" element={<SummaryView />} />

          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </AppLayout>
    </Router>
  );
}

export default App;
