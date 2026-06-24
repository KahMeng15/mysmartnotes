import { useState, useEffect } from 'react';
import {
  Title,
  Text,
  SimpleGrid,
  Card,
  Group,
  ThemeIcon,
  UnstyledButton,
  Box,
  Modal,
  TextInput,
  Textarea,
  ColorInput,
  Button,
  Stack,
  Loader,
  Center,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCheck,
  IconTrendingUp,
  IconClock,
  IconMessageCircle,
  IconUpload,
  IconBooks,
  IconMessageDots,
  IconFileText,
  IconBrain,
  IconNotes,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

const quickActions = [
  { label: 'Upload', icon: IconUpload, color: 'indigo', path: '/upload' },
  { label: 'My Notes', icon: IconBooks, color: 'teal', path: '/mynotes' },
  { label: 'Chat', icon: IconMessageDots, color: 'blue', path: '/chat' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [subjectModalOpened, { open: openSubjectModal, close: closeSubjectModal }] = useDisclosure(false);
  const [summary, setSummary] = useState({
    total_subjects: 0,
    total_notes: 0,
    study_time_7d_mins: 0,
    questions_asked_7d: 0
  });
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.nickname || user.full_name || user.username || 'Student';

  const [recentItems, setRecentItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryData, recentData] = await Promise.all([
          fetchApi('/analytics/dashboard-summary'),
          fetchApi('/search/recent')
        ]);
        setSummary(summaryData);
        setRecentItems(recentData || []);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoadingItems(false);
      }
    };
    loadData();
  }, []);

  const formatStudyTime = (mins) => {
    if (mins >= 60) {
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    return `${mins}m`;
  };

  const stats = [
    { label: 'Total Subjects', value: summary.total_subjects.toString(), delta: 'Active', icon: IconCheck, color: 'teal' },
    { label: 'Total Notes', value: summary.total_notes.toString(), delta: 'Updated', icon: IconTrendingUp, color: 'blue' },
    { label: 'Study Time (7d)', value: formatStudyTime(summary.study_time_7d_mins), delta: 'Focus', icon: IconClock, color: 'grape' },
    { label: 'Questions (7d)', value: summary.questions_asked_7d.toString(), delta: 'Active', icon: IconMessageCircle, color: 'orange' },
  ];

  return (
    <Box pt="lg">
      {/* Welcome Section */}
      <Box mb="xl">
        <Text ff="Instrument Serif, serif" fs="italic" style={{ fontSize: '4rem', fontWeight: 700, lineHeight: 0.8, color: '#171738' }}>
          Welcome back, {userName}
        </Text>
        <Text c="dimmed" size="lg" mt="md">
          Let's continue your learning journey
        </Text>
      </Box>

      {/* Quick Stats */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="lg" mb="xl">
        {stats.map((stat) => (
          <Card key={stat.label} withBorder padding="lg" radius="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                {stat.label}
              </Text>
              <ThemeIcon color={stat.color} variant="light" size={38} radius="md">
                <stat.icon size={20} stroke={1.5} />
              </ThemeIcon>
            </Group>
            <Group align="flex-end" spacing="xs" mt={25}>
              <Text size="xl" fw={700} lh={1}>
                {stat.value}
              </Text>
              <Text c="teal" size="sm" fw={500}>
                {stat.delta}
              </Text>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {/* Quick Actions */}
      <Title order={3} mb="md" fw={600} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>
        Quick Actions
      </Title>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="lg" mb="xl">
        {quickActions.map((action) => (
          <UnstyledButton
            key={action.label}
            onClick={() => navigate(action.path)}
            style={(theme) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: theme.spacing.xl,
              borderRadius: theme.radius.md,
              backgroundColor: '#fff',
              transition: 'transform 150ms ease, box-shadow 150ms ease',
              border: `1px solid ${theme.colors.gray[2]}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: theme.shadows.sm,
              },
            })}
          >
            <ThemeIcon color={action.color} variant="filled" size={50} radius="xl" mb="sm">
              <action.icon size={26} stroke={1.5} />
            </ThemeIcon>
            <Text size="sm" fw={600} c="#171738">
              {action.label}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      {/* Recent Items Section */}
      <Title order={3} mb="md" mt="xl" fw={600} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>Recent Items</Title>
      
      {loadingItems ? (
        <Card withBorder radius="md" padding="xl">
          <Center style={{ height: 150 }}>
            <Stack align="center" spacing="xs">
              <Loader color="blue" type="bars" />
              <Text c="dimmed">Loading recent items...</Text>
            </Stack>
          </Center>
        </Card>
      ) : recentItems.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {recentItems.slice(0, 9).map(item => {
            const iconMap = { resource: IconFileText, exercise: IconBrain, note: IconNotes };
            const Icon = iconMap[item.type] || IconFileText;
            const pathMap = { resource: '/resource/', exercise: '/exercises/', note: '/note/' };
            const labelMap = { resource: 'Resource', exercise: 'Exercise', note: 'Note' };
            return (
              <Card key={`${item.type}-${item.id}`} withBorder radius="md" padding="lg" style={{ cursor: 'pointer' }} onClick={() => navigate(`${pathMap[item.type]}${item.id}`)}>
                <Group mb="xs">
                  <Icon size={18} stroke={1.5} />
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{labelMap[item.type]}</Text>
                </Group>
                <Text fw={600} c="#171738" lineClamp={2}>{item.title}</Text>
                {item.subject_name && (
                  <Text size="sm" c="dimmed" mt={4}>{item.subject_name}</Text>
                )}
              </Card>
            );
          })}
        </SimpleGrid>
      ) : (
        <Card withBorder radius="md" padding="xl">
          <Center style={{ height: 150 }}>
            <Text c="dimmed">No recent items found.</Text>
          </Center>
        </Card>
      )}

      {/* Create Subject Modal */}
      <Modal opened={subjectModalOpened} onClose={closeSubjectModal} title="Create New Subject" centered>
        <Stack>
          <TextInput required label="Subject Name" placeholder="e.g. Calculus I" data-autofocus />
          <Textarea label="Description (Optional)" placeholder="Brief overview of the subject" rows={3} />
          <ColorInput label="Color Tag" defaultValue="#593C8F" format="hex" swatches={['#25262b', '#868e96', '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5', '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e', '#fab005', '#fd7e14']} />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeSubjectModal}>
              Cancel
            </Button>
            <Button onClick={closeSubjectModal}>Create Subject</Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
