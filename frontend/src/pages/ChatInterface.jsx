import { useState, useRef, useEffect } from 'react';
import { Box, Title, Paper, ScrollArea, TextInput, ActionIcon, Group, Text, Avatar, Stack, Loader } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I am your AI study assistant. Ask me anything about your notes!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom
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
      // POST to FastAPI
      const response = await fetchApi('/chat/ask', {
        method: 'POST',
        body: JSON.stringify({
          message: userText,
          context_type: 'global', // Assuming global chat for now
          context_id: null,
          conversation_id: null,
        })
      });

      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: response.answer || "I received a response, but couldn't parse the answer." 
      }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box h="calc(100vh - 100px)" style={{ display: 'flex', flexDirection: 'column' }}>
      <Title order={2} mb="md">AI Study Chat</Title>
      
      <Paper withBorder p="md" radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ScrollArea style={{ flex: 1 }} viewportRef={scrollRef} offsetScrollbars>
          <Stack spacing="md" p="md">
            {messages.map((msg, i) => (
              <Group key={i} align="flex-start" justify={msg.role === 'user' ? 'flex-end' : 'flex-start'} wrap="nowrap">
                {msg.role === 'ai' && <Avatar color="blue" radius="xl">AI</Avatar>}
                <Paper withBorder p="sm" radius="md" bg={msg.role === 'user' ? 'blue.1' : 'gray.0'} style={{ maxWidth: '70%' }}>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</Text>
                </Paper>
                {msg.role === 'user' && <Avatar color="teal" radius="xl">U</Avatar>}
              </Group>
            ))}
            {loading && (
              <Group align="flex-start" justify="flex-start" wrap="nowrap">
                <Avatar color="blue" radius="xl">AI</Avatar>
                <Paper withBorder p="sm" radius="md" bg="gray.0">
                  <Loader size="sm" type="dots" />
                </Paper>
              </Group>
            )}
          </Stack>
        </ScrollArea>
        
        <Box mt="md">
          <TextInput
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
            rightSection={
              <ActionIcon color="blue" variant="filled" onClick={handleSend} disabled={loading || !input.trim()}>
                <IconSend size={16} />
              </ActionIcon>
            }
            radius="xl"
            size="md"
          />
        </Box>
      </Paper>
    </Box>
  );
}
