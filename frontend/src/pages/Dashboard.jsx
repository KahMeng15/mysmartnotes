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
  IconBolt,
  IconClock as IconTimerFallback,
  IconPlus,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

const quickActions = [
  { label: 'Upload', icon: IconUpload, color: 'indigo', path: '/upload' },
  { label: 'My Notes', icon: IconBooks, color: 'teal', path: '/notes' },
  { label: 'Chat', icon: IconMessageDots, color: 'blue', path: '/chat' },
  { label: 'Start Quiz', icon: IconBolt, color: 'pink', path: '/quiz' },
  { label: 'Pomodoro', icon: IconTimerFallback, color: 'yellow', path: '/pomodoro' },
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

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await fetchApi('/analytics/dashboard-summary');
        setSummary(data);
      } catch (err) {
        console.error("Failed to load dashboard summary", err);
      }
    };
    loadSummary();
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
    <Box>
      {/* Welcome Section */}
      <Box mb="xl">
        <Title order={1} fw={900} variant="gradient" gradient={{ from: 'blue', to: 'cyan', deg: 90 }}>
          Welcome back, {userName}
        </Title>
        <Text c="dimmed" size="lg">
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
      <Title order={3} mb="md">
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
              backgroundColor: theme.colors.gray[0],
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
            <Text size="sm" fw={600}>
              {action.label}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      {/* Recent Notes Section */}
      <Group justify="space-between" mb="md" mt="xl">
        <Title order={3}>Recent Notes</Title>
        <Button leftSection={<IconPlus size={16} />} variant="light" onClick={openSubjectModal}>
          Create Subject
        </Button>
      </Group>
      <Card withBorder radius="md" padding="xl">
        <Center style={{ height: 150 }}>
          <Stack align="center" spacing="xs">
            <Loader color="blue" type="bars" />
            <Text c="dimmed">Loading lectures...</Text>
          </Stack>
        </Center>
      </Card>

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
