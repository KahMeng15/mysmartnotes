import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { AppShell, Burger, Group, Text, NavLink as MantineNavLink, ScrollArea } from '@mantine/core';
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
  IconChartBar
} from '@tabler/icons-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NotesManager from './pages/NotesManager';
import UploadDocs from './pages/UploadDocs';
import ChatInterface from './pages/ChatInterface';
import QuizSystem from './pages/QuizSystem';
import SubjectView from './pages/SubjectView';
import LectureView from './pages/LectureView';
import Settings from './pages/Settings';
import GroupView from './pages/GroupView';

function AppLayout({ children }) {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();

  if (location.pathname === '/login' || location.pathname === '/') {
    return <>{children}</>;
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
      bg="#ffffff"
    >
      <AppShell.Header bg="#ffffff">
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Text size="xl" fw={900} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
            MySmartNotes
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" bg="#ffffff">
        <AppShell.Section grow component={ScrollArea}>
          <MantineNavLink component={NavLink} to="/dashboard" label="Dashboard" leftSection={<IconDashboard size="1rem" stroke={1.5} />} />
          <MantineNavLink component={NavLink} to="/upload" label="Upload" leftSection={<IconUpload size="1rem" stroke={1.5} />} />
          <MantineNavLink component={NavLink} to="/mynotes" label="My Notes" leftSection={<IconBooks size="1rem" stroke={1.5} />} />
          <MantineNavLink component={NavLink} to="/chat" label="AI Chat" leftSection={<IconMessageDots size="1rem" stroke={1.5} />} />
          <MantineNavLink component={NavLink} to="/quiz" label="Quiz Engine" leftSection={<IconBolt size="1rem" stroke={1.5} />} />
        </AppShell.Section>
        
        <AppShell.Section>
          <MantineNavLink component={NavLink} to="/settings" label="Settings" leftSection={<IconSettings size="1rem" stroke={1.5} />} />
          <MantineNavLink component={NavLink} to="/login" label="Logout" leftSection={<IconLogin size="1rem" stroke={1.5} />} onClick={() => localStorage.removeItem('token')} />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}

function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/mynotes" element={<NotesManager />} />
          <Route path="/upload" element={<UploadDocs />} />
          <Route path="/chat" element={<ChatInterface />} />
          <Route path="/quiz" element={<QuizSystem />} />
          <Route path="/group/:id" element={<GroupView />} />
          <Route path="/subject/:id" element={<SubjectView />} />
          <Route path="/lecture/:id" element={<LectureView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppLayout>
    </Router>
  );
}

export default App;
