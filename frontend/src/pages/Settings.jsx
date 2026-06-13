import { useState, useEffect } from 'react';
import { Box, Title, Paper, Tabs, TextInput, Textarea, Button, Group, Stack, Text, Divider, RingProgress, Center, Loader, ActionIcon, Table } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  
  const [profile, setProfile] = useState({ nickname: '', full_name: '', email: '' });
  const [stats, setStats] = useState(null);
  const [quotas, setQuotas] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [userPrompts, setUserPrompts] = useState([]);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [profileData, statsData, quotasData, promptsData] = await Promise.all([
          fetchApi('/auth/me'),
          fetchApi('/auth/stats'),
          fetchApi('/auth/quotas').catch(() => null), // Ignore if 404
          fetchApi('/prompts').catch(() => [])
        ]);
        
        setProfile({
          nickname: profileData.nickname || '',
          full_name: profileData.full_name || '',
          email: profileData.email || ''
        });
        setStats(statsData);
        setQuotas(quotasData);
        setUserPrompts(promptsData || []);
      } catch (err) {
        console.error("Failed to load settings data", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleProfileUpdate = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await fetchApi('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          nickname: profile.nickname,
          full_name: profile.full_name
        })
      });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      
      // Update local storage so sidebar/dashboard update
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...user, ...profile }));
      
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordRequest = async () => {
    try {
      await fetchApi('/auth/request-password-change', { method: 'POST' });
      setMessage({ type: 'success', text: 'Password reset email sent!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to request password reset' });
    }
  };

  const handleSavePrompt = async () => {
    try {
      if (editingPrompt) {
        const res = await fetchApi(`/prompts/${editingPrompt.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: promptName, content: promptContent })
        });
        setUserPrompts(userPrompts.map(p => p.id === res.id ? res : p));
      } else {
        const res = await fetchApi('/prompts', {
          method: 'POST',
          body: JSON.stringify({ name: promptName, content: promptContent })
        });
        setUserPrompts([...userPrompts, res]);
      }
      setEditingPrompt(null);
      setPromptName('');
      setPromptContent('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePrompt = async (id) => {
    try {
      await fetchApi(`/prompts/${id}`, { method: 'DELETE' });
      setUserPrompts(userPrompts.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditPrompt = (prompt) => {
    setEditingPrompt(prompt);
    setPromptName(prompt.name);
    setPromptContent(prompt.content);
  };

  const handleCancelEditPrompt = () => {
    setEditingPrompt(null);
    setPromptName('');
    setPromptContent('');
  };

  if (loading) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  return (
    <Box maxWidth={800} mx="auto">
      <Title order={2} mb="xl">Account Settings</Title>

      <Tabs value={activeTab} onChange={setActiveTab} orientation="vertical" variant="pills">
        <Tabs.List mr="xl">
          <Tabs.Tab value="profile">Profile</Tabs.Tab>
          <Tabs.Tab value="account">Account & Security</Tabs.Tab>
          <Tabs.Tab value="prompts">Prompt Templates</Tabs.Tab>
          <Tabs.Tab value="usage">Usage & Quotas</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile">
          <Paper withBorder p="xl" radius="md">
            <Title order={4} mb="md">Public Profile</Title>
            {message && <Text color={message.type === 'error' ? 'red' : 'teal'} mb="md">{message.text}</Text>}
            <Stack>
              <TextInput 
                label="Nickname" 
                value={profile.nickname} 
                onChange={(e) => setProfile({...profile, nickname: e.currentTarget.value})} 
              />
              <TextInput 
                label="Full Name" 
                value={profile.full_name} 
                onChange={(e) => setProfile({...profile, full_name: e.currentTarget.value})} 
              />
              <TextInput label="Email Address" value={profile.email} disabled />
              
              <Group justify="flex-end" mt="md">
                <Button onClick={handleProfileUpdate} loading={saving}>Save Changes</Button>
              </Group>
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="account">
          <Paper withBorder p="xl" radius="md">
            <Title order={4} mb="md">Security</Title>
            {message && <Text color={message.type === 'error' ? 'red' : 'teal'} mb="md">{message.text}</Text>}
            <Text size="sm" c="dimmed" mb="md">
              A password reset link will be sent to your registered email address ({profile.email}).
            </Text>
            <Button variant="light" onClick={handlePasswordRequest}>
              Request Password Change
            </Button>

            <Divider my="xl" />

            <Title order={4} mb="md" c="red">Danger Zone</Title>
            <Text size="sm" c="dimmed" mb="md">
              Once you delete your account, there is no going back. Please be certain.
            </Text>
            <Button color="red" variant="outline">Delete Account</Button>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="prompts">
          <Paper withBorder p="xl" radius="md">
            <Title order={4} mb="md">Custom Prompt Templates</Title>
            <Text size="sm" c="dimmed" mb="xl">
              Manage your custom prompt templates used for generating summaries.
            </Text>

            <Paper withBorder p="md" mb="xl" bg="var(--mantine-color-gray-0)">
              <Title order={5} mb="sm">{editingPrompt ? 'Edit Template' : 'Create New Template'}</Title>
              <Stack>
                <TextInput
                  label="Template Name"
                  placeholder="e.g. Executive Summary"
                  value={promptName}
                  onChange={(e) => setPromptName(e.currentTarget.value)}
                  required
                />
                <Textarea
                  label="Prompt Content"
                  placeholder="Enter the instructions for the AI..."
                  value={promptContent}
                  onChange={(e) => setPromptContent(e.currentTarget.value)}
                  minRows={3}
                  autosize
                  required
                />
                <Group justify="flex-end">
                  {editingPrompt && <Button variant="default" onClick={handleCancelEditPrompt}>Cancel</Button>}
                  <Button onClick={handleSavePrompt} disabled={!promptName.trim() || !promptContent.trim()}>
                    {editingPrompt ? 'Update Template' : 'Create Template'}
                  </Button>
                </Group>
              </Stack>
            </Paper>

            <Title order={5} mb="sm">Your Templates</Title>
            {userPrompts.length === 0 ? (
              <Text c="dimmed" size="sm">You haven't created any custom templates yet.</Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th style={{ width: '100px' }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {userPrompts.map(prompt => (
                    <Table.Tr key={prompt.id}>
                      <Table.Td>{prompt.name}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <ActionIcon variant="subtle" color="blue" onClick={() => handleEditPrompt(prompt)}>
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon variant="subtle" color="red" onClick={() => handleDeletePrompt(prompt.id)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="usage">
          <Paper withBorder p="xl" radius="md">
            <Title order={4} mb="md">Account Usage</Title>
            
            {stats && (
              <Group grow mb="xl">
                <Box>
                  <Text size="xl" fw={700}>{stats.total_notes || 0}</Text>
                  <Text size="sm" c="dimmed">Total Notes Processed</Text>
                </Box>
                <Box>
                  <Text size="xl" fw={700}>{stats.total_chat_messages || 0}</Text>
                  <Text size="sm" c="dimmed">AI Questions Asked</Text>
                </Box>
                <Box>
                  <Text size="xl" fw={700}>{stats.total_quizzes_taken || 0}</Text>
                  <Text size="sm" c="dimmed">Quizzes Completed</Text>
                </Box>
              </Group>
            )}

            {quotas && (
              <>
                <Divider my="xl" />
                <Title order={4} mb="md">Current Plan: Free Tier</Title>
                <Group>
                  <RingProgress
                    size={120}
                    roundCaps
                    thickness={8}
                    sections={[{ value: (quotas.notes_used / quotas.notes_limit) * 100, color: 'blue' }]}
                    label={
                      <Text ta="center" size="xs" fw={700}>
                        {Math.round((quotas.notes_used / quotas.notes_limit) * 100)}%
                      </Text>
                    }
                  />
                  <Box>
                    <Text fw={500}>Document Processing Quota</Text>
                    <Text size="sm" c="dimmed">{quotas.notes_used} of {quotas.notes_limit} documents used this month.</Text>
                  </Box>
                </Group>
              </>
            )}
            
            {!quotas && !stats && <Text c="dimmed">No usage data available yet.</Text>}
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
