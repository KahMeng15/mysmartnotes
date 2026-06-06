import { useState, useRef, useEffect } from 'react';
import { Box, Title, Paper, ScrollArea, TextInput, ActionIcon, Group, Text, Avatar, Stack, Loader, Flex, UnstyledButton, Divider, Center, Button, Modal, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSend, IconPlus, IconClockHour4, IconMessageCircle2, IconArrowsLeftRight } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Ready to dive in? Select a scope and uncover the insights hidden in your notes!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Context Selection State
  const [contextModalOpened, { open: openContextModal, close: closeContextModal }] = useDisclosure(false);
  const [contextType, setContextType] = useState('global');
  const [contextId, setContextId] = useState(null);
  
  // Data for context dropdowns
  const [subjects, setSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);

  useEffect(() => {
    // Pre-fetch subjects and lectures for the context dropdowns
    const loadData = async () => {
      try {
        const [subjData, lectData] = await Promise.all([
          fetchApi('/subjects').catch(() => []),
          fetchApi('/lectures').catch(() => [])
        ]);
        setSubjects(subjData || []);
        setLectures(lectData || []);
      } catch (err) {
        console.error("Failed to load context data", err);
      }
    };
    loadData();
  }, []);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    try {
      const response = await fetchApi('/chat/ask', {
        method: 'POST',
        body: JSON.stringify({
          message: userText,
          context_type: contextType,
          context_id: contextId ? parseInt(contextId, 10) : null,
          conversation_id: null,
        })
      });

      setMessages(prev => [...prev, { role: 'ai', text: response.answer || "I couldn't generate an answer." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // Determine chat title based on current context
  let chatTitle = 'Select a scope to start';
  let chatSubtitle = 'Ask questions about your notes, subjects, or groups';

  if (contextType === 'global') {
    chatTitle = 'Global Knowledge Base';
    chatSubtitle = 'Asking questions across all your notes';
  } else if (contextType === 'subject' && contextId) {
    const subj = subjects.find(s => s.id.toString() === contextId.toString());
    if (subj) {
      chatTitle = `Subject: ${subj.name}`;
      chatSubtitle = 'Asking questions about this subject';
    }
  } else if (contextType === 'lecture' && contextId) {
    const lect = lectures.find(l => l.id.toString() === contextId.toString());
    if (lect) {
      chatTitle = `Note: ${lect.title}`;
      chatSubtitle = 'Asking questions about this specific note';
    }
  }

  return (
    <Flex h="calc(100vh - 90px)" gap="md">
      {/* Sidebar: Conversations */}
      <Paper withBorder radius="md" style={{ width: '300px', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa' }}>
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <Group justify="space-between">
            <Group gap="xs">
              <IconClockHour4 size={20} />
              <Title order={5} style={{ fontFamily: 'Instrument Sans, sans-serif' }}>Conversations</Title>
            </Group>
            <ActionIcon variant="light" color="indigo" radius="xl">
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </Box>
        <ScrollArea style={{ flex: 1 }} p="md">
          <Center h={100}>
            <Text size="sm" c="dimmed">No past conversations</Text>
          </Center>
        </ScrollArea>
      </Paper>

      {/* Main Chat Area */}
      <Paper withBorder radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Header */}
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 10 }}>
          <Group justify="space-between">
            <Box>
              <Title order={4} fw={700} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>
                {chatTitle}
              </Title>
              <Text size="xs" c="dimmed">{chatSubtitle}</Text>
            </Box>
            <Button variant="light" color="gray" leftSection={<IconArrowsLeftRight size={16} />} size="xs" onClick={openContextModal}>
              Change Context
            </Button>
          </Group>
        </Box>

        {/* Chat Messages */}
        <ScrollArea style={{ flex: 1, backgroundColor: '#fff' }} p="xl" viewportRef={scrollRef}>
          <Stack spacing="xl">
            {messages.map((msg, i) => (
              <Group key={i} align="flex-start" justify={msg.role === 'user' ? 'flex-end' : 'flex-start'} wrap="nowrap">
                {msg.role === 'ai' && (
                  <Avatar color="indigo" radius="xl"><IconMessageCircle2 size={20} /></Avatar>
                )}
                <Paper 
                  p="md" 
                  radius="md" 
                  withBorder={msg.role === 'ai'}
                  style={{ 
                    backgroundColor: msg.role === 'user' ? '#171738' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#171738',
                    maxWidth: '80%'
                  }}
                >
                  <Text size="sm" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.text}</Text>
                </Paper>
                {msg.role === 'user' && (
                  <Avatar color="gray" radius="xl">U</Avatar>
                )}
              </Group>
            ))}
            {loading && (
              <Group align="flex-start" wrap="nowrap">
                <Avatar color="indigo" radius="xl"><IconMessageCircle2 size={20} /></Avatar>
                <Paper p="md" radius="md" withBorder>
                  <Loader size="sm" type="dots" color="indigo" />
                </Paper>
              </Group>
            )}
          </Stack>
        </ScrollArea>

        {/* Input Area */}
        <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fdfdfd' }}>
          <TextInput
            placeholder="Type your question here..."
            size="md"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            rightSection={
              <ActionIcon size="lg" color="indigo" variant="filled" onClick={handleSend} disabled={loading || !input.trim()}>
                <IconSend size={18} />
              </ActionIcon>
            }
            styles={{ input: { paddingRight: '50px' } }}
          />
          <Text size="xs" ta="center" c="dimmed" mt="sm">
            AI can make mistakes. Verify important information from your original notes.
          </Text>
        </Box>
      </Paper>

      {/* Change Context Modal */}
      <Modal opened={contextModalOpened} onClose={closeContextModal} title="Change Chat Context" centered>
        <Stack>
          <Select
            label="Scope"
            data={[
              { value: 'global', label: 'Global (All Notes)' },
              { value: 'subject', label: 'Specific Subject' },
              { value: 'lecture', label: 'Specific Note' }
            ]}
            value={contextType}
            onChange={(val) => {
              setContextType(val);
              setContextId(null);
            }}
          />

          {contextType === 'subject' && (
            <Select
              label="Select Subject"
              placeholder="Choose a subject..."
              data={subjects.map(s => ({ value: s.id.toString(), label: s.name }))}
              value={contextId}
              onChange={setContextId}
              searchable
            />
          )}

          {contextType === 'lecture' && (
            <Select
              label="Select Note"
              placeholder="Choose a note..."
              data={lectures.map(l => ({ value: l.id.toString(), label: l.title }))}
              value={contextId}
              onChange={setContextId}
              searchable
            />
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeContextModal}>Cancel</Button>
            <Button onClick={() => {
              // Add a system message when context changes
              setMessages([{ role: 'ai', text: `Context changed. How can I help you with this?` }]);
              closeContextModal();
            }}>
              Confirm Context
            </Button>
          </Group>
        </Stack>
      </Modal>

    </Flex>
  );
}
