import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
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
import NoteView from './pages/NoteView';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';

function App() {
  const [opened, { toggle }] = useDisclosure();

  return (
    <Router>
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: 250,
          breakpoint: 'sm',
          collapsed: { mobile: !opened },
        }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="xl" fw={900} variant="gradient" gradient={{ from: 'blue', to: 'cyan', deg: 90 }}>
              MySmartNotes
            </Text>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <AppShell.Section grow component={ScrollArea}>
            <MantineNavLink component={NavLink} to="/dashboard" label="Dashboard" leftSection={<IconDashboard size="1rem" stroke={1.5} />} />
            <MantineNavLink component={NavLink} to="/analytics" label="Analytics" leftSection={<IconChartBar size="1rem" stroke={1.5} />} />
            <MantineNavLink component={NavLink} to="/upload" label="Upload" leftSection={<IconUpload size="1rem" stroke={1.5} />} />
            <MantineNavLink component={NavLink} to="/notes" label="My Notes" leftSection={<IconBooks size="1rem" stroke={1.5} />} />
            <MantineNavLink component={NavLink} to="/chat" label="AI Chat" leftSection={<IconMessageDots size="1rem" stroke={1.5} />} />
            <MantineNavLink component={NavLink} to="/quiz" label="Quiz Engine" leftSection={<IconBolt size="1rem" stroke={1.5} />} />
          </AppShell.Section>
          
          <AppShell.Section>
            <MantineNavLink component={NavLink} to="/settings" label="Settings" leftSection={<IconSettings size="1rem" stroke={1.5} />} />
            <MantineNavLink component={NavLink} to="/login" label="Login / Auth" leftSection={<IconLogin size="1rem" stroke={1.5} />} />
          </AppShell.Section>
        </AppShell.Navbar>

        <AppShell.Main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/notes" element={<NotesManager />} />
            <Route path="/upload" element={<UploadDocs />} />
            <Route path="/chat" element={<ChatInterface />} />
            <Route path="/quiz" element={<QuizSystem />} />
            <Route path="/subject/:id" element={<NoteView />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AppShell.Main>
      </AppShell>
    </Router>
  );
}

export default App;
