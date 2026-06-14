import { useState, useRef, useEffect } from 'react';
import { Box, Title, Paper, ScrollArea, TextInput, ActionIcon, Group, Text, Avatar, Stack, Loader, Flex, Button, Divider, Center, Select, Badge } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconSend, IconPlus, IconClockHour4, IconMessageCircle2, IconAdjustmentsHorizontal,
  IconRobot, IconUser, IconWorld, IconFolder, IconBook, IconFile,
  IconSchool, IconBolt, IconList, IconFileText, IconMarkdown, IconX,
  IconWand, IconBrain, IconBabyCarriage, IconListNumbers, IconTable
} from '@tabler/icons-react';
import { fetchApi } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Settings State
  const [settingsOpened, { toggle: toggleSettings, close: closeSettings }] = useDisclosure(false);
  
  // Context Selection State
  const [contextType, setContextType] = useState('global');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  
  // AI Parameters
  const [aiMode, setAiMode] = useState('elaborate');
  const [outputFormat, setOutputFormat] = useState('sentence');
  
  // Data for context dropdowns
  const [groups, setGroups] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [notes, setNotes] = useState([]);

  // Sidebar sizing
  const [sidebarWidth, setSidebarWidth] = useState(300);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [grpData, subjData, lectData] = await Promise.all([
          fetchApi('/groups').catch(() => []),
          fetchApi('/subjects').catch(() => []),
          fetchApi('/notes').catch(() => [])
        ]);
        
        setGroups((grpData || []).sort((a, b) => a.name.localeCompare(b.name)));
        setSubjects((subjData || []).sort((a, b) => a.name.localeCompare(b.name)));
        setNotes((lectData || []).sort((a, b) => a.title.localeCompare(b.title)));
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
      let note_id = null;
      let subject_id = null;
      let group_id = null;
      
      if (contextType === 'note') note_id = selectedNoteId;
      if (contextType === 'subject') subject_id = selectedSubjectId;
      if (contextType === 'group') group_id = selectedGroupId;

      const response = await fetchApi('/chat/ask', {
        method: 'POST',
        body: JSON.stringify({
          message: userText,
          note_id: note_id ? String(note_id) : null,
          subject_id: subject_id ? String(subject_id) : null,
          group_id: group_id ? String(group_id) : null,
          ai_mode: aiMode,
          output_format: outputFormat,
          conversation_id: null,
        })
      });

      const answer = response.answer || response.response || (response.task_id ? "Request submitted. I am thinking..." : "I couldn't generate an answer.");
      setMessages(prev => [...prev, { role: 'ai', text: answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // Icons for mapping
  const contextIcons = {
    global: <IconWorld size={14} />,
    group: <IconFolder size={14} />,
    subject: <IconBook size={14} />,
    note: <IconFile size={14} />
  };

  const modeIcons = {
    quick: <IconBolt size={14} />,
    simple: <IconWand size={14} />,
    normal: <IconBrain size={14} />,
    elaborate: <IconSchool size={14} />,
    eli5: <IconBabyCarriage size={14} />
  };
  
  const modeLabels = {
    quick: 'Quick',
    simple: 'Simple',
    normal: 'Normal',
    elaborate: 'Elaborate',
    eli5: 'Explain like I am 5'
  };

  const formatIcons = {
    sentence: <IconFileText size={14} />,
    pointform: <IconList size={14} />,
    numbered_list: <IconListNumbers size={14} />,
    table: <IconTable size={14} />
  };
  
  const formatLabels = {
    sentence: 'Sentence',
    pointform: 'Pointform',
    numbered_list: 'Numbered List',
    table: 'Table'
  };

  const getContextPillText = () => {
    if (contextType === 'global') return 'Global Scope';
    
    if (contextType === 'group') {
      const g = groups.find(x => x.id.toString() === selectedGroupId);
      return g ? `Group: ${g.name}` : 'Select Group...';
    }
    if (contextType === 'subject') {
      const s = subjects.find(x => x.id.toString() === selectedSubjectId);
      return s ? `Subject: ${s.name}` : 'Select Subject...';
    }
    if (contextType === 'note') {
      const n = notes.find(x => x.id.toString() === selectedNoteId);
      return n ? `Note: ${n.title}` : 'Select Note...';
    }
    
    return `${contextType} Scope`;
  };

  return (
    <Flex h="100vh">
      {/* Sidebar: Conversations */}
      <Box 
        style={{ 
          width: sidebarWidth, 
          minWidth: '200px', 
          maxWidth: '500px', 
          resize: 'horizontal', 
          overflow: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          borderRight: '1px solid #eaeaea',
          backgroundColor: '#fafafa'
        }}
      >
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', height: '60px', display: 'flex', alignItems: 'center' }}>
          <Group justify="space-between" style={{ width: '100%' }}>
            <Title order={4} fw={700} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>Conversations</Title>
            <ActionIcon variant="default" size="sm" onClick={() => setMessages([])}>
              <IconPlus size={16} />
            </ActionIcon>
          </Group>
        </Box>
        <ScrollArea style={{ flex: 1 }} p="md">
          <Center h={100}>
            <Text size="sm" c="dimmed">No past conversations</Text>
          </Center>
        </ScrollArea>
      </Box>

      {/* Main Chat Area */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#fff' }}>
        
        {/* Header */}
        <Box p="md" style={{ borderBottom: '1px solid #eaeaea', backgroundColor: '#fff', zIndex: 10, height: '60px', display: 'flex', alignItems: 'center' }}>
          <Title order={4} fw={700} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>
            Chat
          </Title>
        </Box>

        {/* Chat Messages */}
        {messages.length === 0 ? (
          <Flex flex={1} align="center" justify="center" direction="column" style={{ opacity: 0.6 }}>
            <IconMessageCircle2 size={60} color="#ccc" style={{ marginBottom: 16 }} />
            <Title order={3} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#666' }}>Ready to dive in?</Title>
            <Text c="dimmed" mt="xs" maw={400} ta="center">
              Select a scope and uncover the insights hidden in your notes!
            </Text>
          </Flex>
        ) : (
          <ScrollArea style={{ flex: 1 }} p="xl" viewportRef={scrollRef}>
            <Stack spacing="xl" style={{ maxWidth: '800px', margin: '0 auto' }}>
              {messages.map((msg, i) => (
                <Group key={i} align="flex-start" justify={msg.role === 'user' ? 'flex-end' : 'flex-start'} wrap="nowrap" mt="md">
                  {msg.role === 'ai' && (
                    <Avatar color="indigo" radius="xl" size="md"><IconRobot size={20} /></Avatar>
                  )}
                  
                  {msg.role === 'user' ? (
                    <Paper 
                      p="md" 
                      radius="xl" 
                      style={{ 
                        backgroundColor: '#171738',
                        color: '#fff',
                        maxWidth: '80%',
                        borderBottomRightRadius: '4px'
                      }}
                    >
                      <Text size="sm" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.text}</Text>
                    </Paper>
                  ) : (
                    <Box style={{ flex: 1, maxWidth: 'calc(100% - 60px)' }}>
                      <Box className="markdown-body" style={{ color: '#171738', fontSize: '15px', lineHeight: 1.6 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </Box>
                    </Box>
                  )}
                  
                  {msg.role === 'user' && (
                    <Avatar color="gray" radius="xl" size="md"><IconUser size={20} /></Avatar>
                  )}
                </Group>
              ))}
              {loading && (
                <Group align="flex-start" wrap="nowrap" mt="md">
                  <Avatar color="indigo" radius="xl" size="md"><IconRobot size={20} /></Avatar>
                  <Loader size="sm" type="dots" color="indigo" mt="xs" />
                </Group>
              )}
            </Stack>
          </ScrollArea>
        )}

        {/* Input & Parameters Area */}
        <Box p="md" style={{ borderTop: '1px solid #eaeaea', backgroundColor: '#fdfdfd' }}>
          <Box style={{ maxWidth: '800px', margin: '0 auto' }}>
            
            {/* Action Pills to toggle settings - Hidden when settings open */}
            {!settingsOpened && (
              <Group justify="space-between" mb="sm" align="center">
                <Group gap="xs" wrap="wrap">
                  <Badge 
                    component="button" 
                    onClick={toggleSettings} 
                    variant="light" color="grape" size="sm" tt="capitalize" fw={600}
                    leftSection={contextIcons[contextType]}
                    style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                  >
                    {getContextPillText()}
                  </Badge>

                  <Badge 
                    component="button" 
                    onClick={toggleSettings} 
                    variant="light" color="blue" size="sm" tt="capitalize" fw={600}
                    leftSection={modeIcons[aiMode]}
                    style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                  >
                    {modeLabels[aiMode]}
                  </Badge>

                  <Badge 
                    component="button" 
                    onClick={toggleSettings} 
                    variant="light" color="teal" size="sm" tt="capitalize" fw={600}
                    leftSection={formatIcons[outputFormat]}
                    style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                  >
                    {formatLabels[outputFormat]}
                  </Badge>
                </Group>
                
                <ActionIcon variant="subtle" color="gray" radius="xl" onClick={toggleSettings}>
                  <IconAdjustmentsHorizontal size={18} />
                </ActionIcon>
              </Group>
            )}

            {/* Animated Settings/Parameters Configuration */}
            <Box style={{ 
              maxHeight: settingsOpened ? '800px' : '0', 
              opacity: settingsOpened ? 1 : 0, 
              overflow: 'visible', 
              transition: 'all 0.3s ease' 
            }}>
              {settingsOpened && (
                <Paper p="md" withBorder radius="md" mb="md" bg="#f8f9fa" style={{ position: 'relative' }}>
                  <ActionIcon onClick={toggleSettings} variant="subtle" color="gray" style={{ position: 'absolute', top: 10, right: 10, zIndex: 5 }}>
                    <IconX size={18} />
                  </ActionIcon>

                  <Stack spacing="md">
                    {/* Context Selector Options */}
                    <Box>
                      <Text size="sm" fw={600} mb="xs" c="dimmed">Context Scope</Text>
                      <Group gap="xs" wrap="wrap">
                        {['global', 'group', 'subject', 'note'].map(scope => (
                          <Badge 
                            key={scope}
                            component="button"
                            onClick={() => {
                              setContextType(scope);
                              // Reset cascading selections when scope changes
                              setSelectedGroupId(null);
                              setSelectedSubjectId(null);
                              setSelectedNoteId(null);
                            }}
                            variant={contextType === scope ? "filled" : "light"}
                            color="grape"
                            size="md"
                            tt="capitalize"
                            fw={600}
                            style={{ cursor: 'pointer' }}
                            leftSection={contextIcons[scope]}
                          >
                            {scope}
                          </Badge>
                        ))}
                      </Group>
                      
                      {/* Cascading Context Dropdowns */}
                      {contextType !== 'global' && (
                        <Box style={{ animation: 'fadeIn 0.3s' }} mt="md">
                          <Stack spacing="sm">
                            {['group', 'subject', 'note'].includes(contextType) && (
                              <Select
                                label="Select Group"
                                size="sm"
                                placeholder="Choose a group..."
                                data={groups.map(g => ({ value: g.id.toString(), label: g.name }))}
                                value={selectedGroupId}
                                onChange={(val) => {
                                  setSelectedGroupId(val);
                                  setSelectedSubjectId(null);
                                  setSelectedNoteId(null);
                                }}
                                searchable
                                maxDropdownHeight={200}
                              />
                            )}
                            
                            {['subject', 'note'].includes(contextType) && (
                              <Select
                                label="Select Subject"
                                size="sm"
                                placeholder="Choose a subject..."
                                data={subjects.filter(s => s.group_id?.toString() === selectedGroupId).map(s => ({ value: s.id.toString(), label: s.name }))}
                                value={selectedSubjectId}
                                onChange={(val) => {
                                  setSelectedSubjectId(val);
                                  setSelectedNoteId(null);
                                }}
                                searchable
                                maxDropdownHeight={200}
                                disabled={!selectedGroupId}
                              />
                            )}
                            
                            {contextType === 'note' && (
                              <Select
                                label="Select Note"
                                size="sm"
                                placeholder="Choose a note..."
                                data={notes.filter(n => n.subject_id?.toString() === selectedSubjectId).map(n => ({ value: n.id.toString(), label: n.title }))}
                                value={selectedNoteId}
                                onChange={setSelectedNoteId}
                                searchable
                                maxDropdownHeight={200}
                                disabled={!selectedSubjectId}
                              />
                            )}
                          </Stack>
                        </Box>
                      )}
                    </Box>
                    
                    <Divider />

                    <Group grow align="flex-start">
                      {/* AI Mode Options */}
                      <Box>
                        <Text size="sm" fw={600} mb="xs" c="dimmed">AI Mode</Text>
                        <Group gap="xs" wrap="wrap">
                          {['quick', 'simple', 'normal', 'elaborate', 'eli5'].map(mode => (
                            <Badge 
                              key={mode}
                              component="button"
                              onClick={() => setAiMode(mode)}
                              variant={aiMode === mode ? "filled" : "light"}
                              color="blue"
                              size="md"
                              tt="capitalize"
                              fw={600}
                              style={{ cursor: 'pointer' }}
                              leftSection={modeIcons[mode]}
                            >
                              {modeLabels[mode]}
                            </Badge>
                          ))}
                        </Group>
                      </Box>
                      
                      {/* Output Format Options */}
                      <Box>
                        <Text size="sm" fw={600} mb="xs" c="dimmed">Output Format</Text>
                        <Group gap="xs" wrap="wrap">
                          {[
                            { value: 'sentence', label: 'Sentence' }, 
                            { value: 'pointform', label: 'Pointform' },
                            { value: 'numbered_list', label: 'Numbered List' },
                            { value: 'table', label: 'Table' }
                          ].map(format => (
                            <Badge 
                              key={format.value}
                              component="button"
                              onClick={() => setOutputFormat(format.value)}
                              variant={outputFormat === format.value ? "filled" : "light"}
                              color="teal"
                              size="md"
                              tt="capitalize"
                              fw={600}
                              style={{ cursor: 'pointer' }}
                              leftSection={formatIcons[format.value]}
                            >
                              {format.label}
                            </Badge>
                          ))}
                        </Group>
                      </Box>
                    </Group>
                  </Stack>
                </Paper>
              )}
            </Box>

            {/* Chat Input */}
            <TextInput
              placeholder="Ask anything about your notes..."
              size="lg"
              radius="xl"
              value={input}
              onChange={(e) => {
                setInput(e.currentTarget.value);
                if (settingsOpened) {
                  closeSettings();
                }
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              rightSection={
                <ActionIcon size="lg" color="indigo" variant="filled" radius="xl" onClick={handleSend} disabled={loading || !input.trim()} mr="sm">
                  <IconSend size={18} />
                </ActionIcon>
              }
              styles={{ input: { paddingRight: '60px', backgroundColor: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' } }}
            />
            <Text size="xs" ta="center" c="dimmed" mt="xs">
              AI can make mistakes. Verify important information from your original notes.
            </Text>
          </Box>
        </Box>
      </Box>
    </Flex>
  );
}
