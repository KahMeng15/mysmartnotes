import { useState, useEffect } from 'react';
import { Box, Title, Paper, Tabs, TextInput, Textarea, Button, Group, Stack, Text, Divider, RingProgress, Center, Loader, ActionIcon, Table, Modal, ScrollArea } from '@mantine/core';
import { IconEdit, IconTrash, IconPlus, IconSparkles } from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { fetchApi } from '../lib/api';

export default function Settings() {
  const isMobile = useMediaQuery('(max-width: 48em)');
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
  const [createPromptModalOpened, setCreatePromptModalOpened] = useState(false);
  const [newPromptInput, setNewPromptInput] = useState('');
  const [generatingNewPrompt, setGeneratingNewPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

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
    if (!promptName.trim() || !promptContent.trim()) return;
    setSavingPrompt(true);
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
      setCreatePromptModalOpened(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrompt(false);
    }
  };

  const generatePrompt = async () => {
    if (!newPromptInput.trim()) return;
    setGeneratingNewPrompt(true);
    try {
      const res = await fetchApi('/notes/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({ user_input: newPromptInput })
      });
      if (res) {
        if (res.prompt) setPromptContent(res.prompt);
        if (res.name) setPromptName(res.name);
      }
    } catch (err) {
      console.error("Failed to generate prompt", err);
    } finally {
      setGeneratingNewPrompt(false);
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
    setNewPromptInput('');
    setCreatePromptModalOpened(true);
  };

  const handleCancelEditPrompt = () => {
    setEditingPrompt(null);
    setPromptName('');
    setPromptContent('');
    setCreatePromptModalOpened(false);
  };

  if (loading) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  return (
    <Box maw={800} mx="auto">
      <Title order={2} mb="xl">Account Settings</Title>

      <Tabs value={activeTab} onChange={setActiveTab} orientation={isMobile ? 'horizontal' : 'vertical'} variant="pills">
        <Tabs.List mr={isMobile ? 0 : 'xl'}>
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
            <Group justify="space-between" align="center" mb="xl">
              <div>
                <Title order={4} mb="xs">Custom Prompt Templates</Title>
                <Text size="sm" c="dimmed">
                  Manage your custom prompt templates used for generating summaries.
                </Text>
              </div>
              <Button leftSection={<IconPlus size={16} />} onClick={() => {
                setEditingPrompt(null);
                setPromptName('');
                setPromptContent('');
                setNewPromptInput('');
                setCreatePromptModalOpened(true);
              }}>
                Create Template
              </Button>
            </Group>

            <Title order={5} mb="sm">Your Templates</Title>
            {userPrompts.length === 0 ? (
              <Text c="dimmed" size="sm">You haven't created any custom templates yet.</Text>
            ) : (
              <ScrollArea>
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
              </Table></ScrollArea>
            )}
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="usage">
          <Paper withBorder p="xl" radius="md">
            <Title order={4} mb="md">Account Usage</Title>
            
            {stats && (
              <Group grow mb="xl" wrap="wrap">
                <Box miw={120}>
                  <Text size="xl" fw={700}>{stats.total_notes || 0}</Text>
                  <Text size="sm" c="dimmed">Total Notes Processed</Text>
                </Box>
                <Box miw={120}>
                  <Text size="xl" fw={700}>{stats.total_chat_messages || 0}</Text>
                  <Text size="sm" c="dimmed">AI Questions Asked</Text>
                </Box>
                <Box miw={120}>
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
      <Modal opened={createPromptModalOpened} onClose={() => setCreatePromptModalOpened(false)} title={editingPrompt ? "Edit Custom Template" : "Create Custom Template"} centered size="lg">
        <form onSubmit={(e) => { e.preventDefault(); handleSavePrompt(); }}>
          <Stack gap="md">
            <TextInput
              label="Template Name"
              placeholder="e.g. Executive Summary"
              value={promptName}
              onChange={(e) => setPromptName(e.currentTarget.value)}
              required
              data-autofocus
            />
            <Textarea
              label="Prompt Content"
              placeholder="Enter the instructions for the AI..."
              value={promptContent}
              onChange={(e) => setPromptContent(e.currentTarget.value)}
              minRows={5}
              autosize
              required
            />
            
            <Divider label="AI Prompt Generator" labelPosition="center" my="sm" />
            
            <Text size="xs" c="dimmed">
              Describe what you want, and the AI will generate a structured template for you.
            </Text>
            
            <Group align="flex-end" gap="xs" style={{ flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}>
                <Textarea
                  label="AI Instruction"
                  placeholder="e.g., focus on vocabulary, write a cheat sheet with formulas..."
                  value={newPromptInput}
                  onChange={(e) => setNewPromptInput(e.currentTarget.value)}
                  minRows={2}
                  autosize
                />
              </div>
              <Button 
                variant="light" 
                color="indigo" 
                onClick={generatePrompt} 
                loading={generatingNewPrompt} 
                disabled={!newPromptInput.trim()}
                leftSection={<IconSparkles size={16} />}
                style={{ height: '56px' }}
              >
                Generate
              </Button>
            </Group>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setCreatePromptModalOpened(false)}>Cancel</Button>
              <Button type="submit" loading={savingPrompt} disabled={!promptName.trim() || !promptContent.trim()}>
                {editingPrompt ? 'Update Template' : 'Create Template'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
