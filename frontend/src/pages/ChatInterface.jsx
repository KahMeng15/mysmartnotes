import { useState, useRef, useEffect } from 'react';
import { Box, Title, Paper, ScrollArea, TextInput, ActionIcon, Group, Text, Stack, Loader, Flex, Divider, Center, Select, Badge, Menu, Modal, Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconSend, IconPlus, IconClockHour4, IconMessageCircle2, IconAdjustmentsHorizontal,
  IconRobot, IconWorld, IconFolder, IconBook, IconFile,
  IconSchool, IconBolt, IconList, IconFileText, IconX,
  IconWand, IconBrain, IconBabyCarriage, IconListNumbers, IconTable,
  IconInfoCircle, IconRefresh, IconDotsVertical, IconPencil, IconPin, IconTrash, IconPinFilled
} from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const stepLabels = {
  step1: "1. Scope Identification",
  step2: "2. Conversation Detection",
  step3: "3. Intent Classification",
  step4: "4. Local Context Retrieval",
  step5: "5. Web Search Fallback",
  step6: "6. Prompt Building",
  step7: "7. AI Answer Generation",
  step9: "9. Save & Housekeeping"
};

const parseAiMessage = (text) => {
  if (!text) return { reasoning: null, finalAnswer: null };
  
  let reasoning = null;
  let finalAnswer = text;
  
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
  else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
  if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
  cleanText = cleanText.trim();
  
  try {
    const parsed = JSON.parse(cleanText);
    if (parsed) {
      if (parsed.reasoning) reasoning = parsed.reasoning;
      if (parsed.final_answer) finalAnswer = parsed.final_answer;
    }
  } catch(e) {
    const reasoningMatch = cleanText.match(/"reasoning"\s*:\s*"([\s\S]*?)(?:"\s*,|"$|$)/);
    if (reasoningMatch && reasoningMatch[1]) {
      reasoning = reasoningMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    
    const answerMatch = cleanText.match(/"final_answer"\s*:\s*"([\s\S]*?)(?:"\s*}|"\s*,|"$|$)/);
    if (answerMatch && answerMatch[1]) {
      finalAnswer = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (reasoningMatch) {
      finalAnswer = "*(The response was cut off before an answer could be generated. Please try again.)*"; 
    }
  }
  
  return { reasoning, finalAnswer };
};

export default function ChatInterface() {
  const { cvid } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);

  // Task Polling State
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);

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

  const [renameModalOpened, setRenameModalOpened] = useState(false);
  const [conversationToRename, setConversationToRename] = useState(null);
  const [newTitle, setNewTitle] = useState('');

  const handleRename = async () => {
    if (!conversationToRename || !newTitle.trim()) return;
    try {
      await fetchApi(`/chat/conversations/${conversationToRename.conversation_id}/title`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim() })
      });
      setRenameModalOpened(false);
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePin = async (conv, e) => {
    e.stopPropagation();
    try {
      await fetchApi(`/chat/conversations/${conv.conversation_id}/pin`, { method: 'PUT' });
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (conv, e) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this conversation?")) {
      try {
        await fetchApi(`/chat/conversations/${conv.conversation_id}`, { method: 'DELETE' });
        if (currentConversationId === conv.conversation_id) {
          navigate('/chat');
        } else {
          fetchConversations();
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const fetchConversations = async () => {
    try {
      const data = await fetchApi('/chat/conversations');
      setConversations(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (cvid) {
      if (cvid !== currentConversationId) {
        loadConversation(cvid);
      }
    } else {
      if (currentConversationId !== null) {
        setCurrentConversationId(null);
        setMessages([]);
        setCurrentTaskId(null);
        setLoading(false);
      }
    }
  }, [cvid]);

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
    fetchConversations();
  }, []);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, taskStatus]);

  // Fix stale closures by keeping track of the latest conversation id
  const currentConversationIdRef = useRef(currentConversationId);
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Task Polling Effect
  useEffect(() => {
    let interval;
    if (loading && currentTaskId) {
      interval = setInterval(checkTaskStatus, 500);
    }
    return () => clearInterval(interval);
  }, [loading, currentTaskId]);

  const checkTaskStatus = async () => {
    if (!currentTaskId) return;
    try {
      const statusData = await fetchApi(`/search/tasks/${currentTaskId}`);
      if (statusData) {
        setTaskStatus(statusData);
        if (statusData.status === 'completed' || statusData.status === 'failed') {
          setCurrentTaskId(null);
          setLoading(false);
          
          if (statusData.status === 'completed') {
             const latestConvId = currentConversationIdRef.current;
             if (!latestConvId && statusData.result?.conversation_id) {
               setCurrentConversationId(statusData.result.conversation_id);
               navigate(`/chat/${statusData.result.conversation_id}`, { replace: true });
             }
             fetchConversations();
             
             const answer = statusData.result?.response || statusData.result?.answer || "Done, but no answer found.";
             setMessages(prev => [...prev, { 
               role: 'ai', 
               text: answer,
               detailed_sources: statusData.result?.detailed_sources,
               timings: statusData.result?.timings,
               ai_model: statusData.result?.ai_model,
               ai_mode: statusData.result?.ai_mode,
               output_format: statusData.result?.output_format,
               note_id: statusData.result?.note_id,
               subject_id: statusData.result?.subject_id,
               group_id: statusData.result?.group_id
             }]);
          } else {
             setMessages(prev => [...prev, { role: 'ai', text: `Failed: ${statusData.error || 'Unknown error'}` }]);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch task status", e);
    }
  };

  const loadConversation = async (convId) => {
    try {
      setLoading(true);
      setCurrentConversationId(convId);
      const msgs = await fetchApi(`/chat/conversations/${convId}/messages`);
      
      const formattedMsgs = [];
      for (const m of msgs) {
        formattedMsgs.push({ role: 'user', text: m.message });
        formattedMsgs.push({ 
          role: 'ai', 
          text: m.response,
          detailed_sources: m.detailed_sources,
          timings: m.timings,
          ai_model: m.ai_model,
          ai_mode: m.ai_mode,
          output_format: m.output_format,
          note_id: m.note_id,
          subject_id: m.subject_id,
          group_id: m.group_id
        });
      }
      setMessages(formattedMsgs);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load conversation", err);
      setLoading(false);
    }
  };

  const startNewChat = () => {
    navigate('/chat');
  };

  const handleSend = async (overrideText = null) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : input.trim();
    if (!textToSend || loading) return;
    
    if (typeof overrideText !== 'string') setInput('');
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setLoading(true);
    setTaskStatus(null);

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
          message: textToSend,
          note_id: note_id ? String(note_id) : null,
          subject_id: subject_id ? String(subject_id) : null,
          group_id: group_id ? String(group_id) : null,
          ai_mode: aiMode,
          output_format: outputFormat,
          conversation_id: currentConversationId,
        })
      });

      if (response.task_id) {
        setCurrentTaskId(response.task_id);
        setTaskStatus({ status: 'pending', progress_message: 'Initializing search...' });
      } else {
        if (!currentConversationId && response.conversation_id) {
          setCurrentConversationId(response.conversation_id);
          navigate(`/chat/${response.conversation_id}`, { replace: true });
        }
        fetchConversations();
        
        const answer = response.answer || response.response || "I couldn't generate an answer.";
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: answer,
          detailed_sources: response.detailed_sources,
          timings: response.timings,
          ai_model: response.ai_model,
          ai_mode: response.ai_mode,
          output_format: response.output_format,
          note_id: response.note_id,
          subject_id: response.subject_id,
          group_id: response.group_id
        }]);
        setLoading(false);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
      setLoading(false);
    }
  };

  const handleRepeat = (index) => {
    let userText = "";
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userText = messages[i].text;
        break;
      }
    }
    if (userText) {
      handleSend(userText);
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

  const renderMessageContent = (text, sources) => {
    let { finalAnswer } = parseAiMessage(text);
    if (!finalAnswer) {
      finalAnswer = text || "*(No response provided)*";
    }

    const processedAnswer = finalAnswer.replace(/\[(\d+)\]/g, '[$1](#source-$1)');

    const LinkRenderer = (props) => {
      const { href, children } = props;
      if (href && href.startsWith('#source-')) {
        const sourceIndex = parseInt(href.replace('#source-', ''), 10) - 1;
        return (
          <sup style={{ margin: '0 2px' }}>
            <a 
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (sources && sources[sourceIndex]) {
                  const src = sources[sourceIndex];
                  if (src.is_web) {
                    window.open(src.url, '_blank');
                  } else if (src.note_id) {
                    window.open(`/note/${src.note_id}?highlight=${encodeURIComponent(src.text_preview)}`, '_blank');
                  }
                }
              }}
              style={{ textDecoration: 'none', color: '#1c7ed6', fontWeight: 'bold' }}
            >
              {children}
            </a>
          </sup>
        );
      }
      return <a {...props}>{children}</a>;
    };

    return (
      <Box className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: LinkRenderer }}>
          {processedAnswer}
        </ReactMarkdown>
      </Box>
    );
  };

  const MetadataBlock = ({ msg, messageIndex }) => {
    const { reasoning } = parseAiMessage(msg.text);
    if (!msg.detailed_sources && !msg.timings && !msg.ai_model && !reasoning) return null;
    
    const hasSources = msg.detailed_sources && msg.detailed_sources.length > 0;
    const isWebSearch = hasSources && msg.detailed_sources.some(s => s.is_web);
    
    const [activeTab, setActiveTab] = useState(null);
  
    return (
      <Box mt="sm" pt="xs" style={{ fontSize: '12px' }}>
        <Group gap="md" style={{ color: '#888' }}>
          {hasSources && (
            <Group gap={4} style={{ cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setActiveTab(prev => prev === 'sources' ? null : 'sources')} c={activeTab === 'sources' ? 'blue' : undefined}>
              <IconFileText size={14} />
              <Text size="xs" fw={500}>Sources</Text>
            </Group>
          )}

          {reasoning && (
            <Group gap={4} style={{ cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setActiveTab(prev => prev === 'brain' ? null : 'brain')} c={activeTab === 'brain' ? 'grape' : undefined}>
              <IconBrain size={14} />
              <Text size="xs" fw={500}>Thought Process</Text>
            </Group>
          )}

          <Group gap={4} style={{ cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setActiveTab(prev => prev === 'info' ? null : 'info')} c={activeTab === 'info' ? 'teal' : undefined}>
            <IconInfoCircle size={14} />
            <Text size="xs" fw={500}>Info</Text>
          </Group>

          <Group gap={4} style={{ cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => handleRepeat(messageIndex)}>
            <IconRefresh size={14} />
            <Text size="xs" fw={500}>Retry</Text>
          </Group>
        </Group>
  
        {activeTab && (
          <Paper p="sm" mt="sm" withBorder bg="#f8f9fa" radius="md">
            {activeTab === 'brain' && reasoning && (
              <Box>
                <Text size="xs" fw={600} mb="xs" c="grape"><IconBrain size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> AI Thought Process</Text>
                <Text size="xs" c="dimmed" style={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{reasoning}</Text>
              </Box>
            )}

            {activeTab === 'info' && (
              <Box>
                <Text size="xs" fw={600} mb="xs" c="teal"><IconInfoCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> Request Details</Text>
                
                <Text size="xs" mb={4}><IconRobot size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> Model: {msg.ai_model || 'Unknown'}</Text>
                {msg.ai_mode && <Text size="xs" mb={4}><IconWand size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> Mode: {modeLabels[msg.ai_mode] || msg.ai_mode}</Text>}
                {msg.output_format && <Text size="xs" mb={4}><IconFileText size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> Format: {formatLabels[msg.output_format] || msg.output_format}</Text>}
                
                {(msg.note_id || msg.subject_id || msg.group_id) && (
                  <Text size="xs" mb="xs">
                    <IconFolder size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> 
                    Context: {msg.note_id ? 'Specific Note' : msg.subject_id ? 'Subject Level' : msg.group_id ? 'Group Level' : 'Global Scope'}
                  </Text>
                )}
                
                {msg.timings && msg.timings.step_times ? (
                  <Box mt="xs">
                    <Text size="xs" fw={600} mb="xs"><IconListNumbers size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> Process Timing (ms)</Text>
                    {Object.entries(msg.timings.step_times).map(([step, time]) => (
                      <Group key={step} justify="space-between" mb={2}>
                        <Text size="xs" c="dimmed">{stepLabels[step] || step}</Text>
                        <Text size="xs" fw={500}>{Number(time).toFixed(2)}ms</Text>
                      </Group>
                    ))}
                    <Divider my="xs" />
                    <Group justify="space-between">
                      <Text size="xs" fw={600}>Total Time</Text>
                      <Text size="xs" c="teal" fw={600}>{Number(msg.timings.total_ms).toFixed(2)}ms</Text>
                    </Group>
                  </Box>
                ) : msg.timings ? (
                   <Box mt="xs">
                     <Text size="xs" fw={600} mb="xs"><IconClockHour4 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/> Timing</Text>
                     <Group justify="space-between">
                       <Text size="xs" fw={600}>Total Time</Text>
                       <Text size="xs" c="teal" fw={600}>{Number(msg.timings.total_ms).toFixed(2)}ms</Text>
                     </Group>
                   </Box>
                ) : <Text size="xs" c="dimmed">No timing data available.</Text>}
              </Box>
            )}

            {activeTab === 'sources' && hasSources && (
              <Box>
                {isWebSearch && (
                  <Badge color="indigo" mb="sm" leftSection={<IconWorld size={10}/>}>Included Web Search Results</Badge>
                )}
                <Stack spacing="xs">
                  {msg.detailed_sources.map((src, idx) => (
                    <Paper 
                      key={idx} 
                      p="xs" 
                      withBorder 
                      bg="white"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f3f5'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      onClick={() => {
                        if (src.is_web) {
                          window.open(src.url, '_blank');
                        } else if (src.note_id) {
                          window.open(`/note/${src.note_id}?highlight=${encodeURIComponent(src.text_preview)}`, '_blank');
                        }
                      }}
                    >
                      {src.is_web ? (
                        <Box>
                          <Text size="xs" fw={600} c="blue"><IconWorld size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} /> [{idx + 1}] Web Reference</Text>
                          <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.url}</Text>
                        </Box>
                      ) : (
                        <Box>
                          <Text size="xs" fw={600} c="blue"><IconFileText size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} /> [{idx + 1}] Reference ({src.score}% match)</Text>
                          <Text size="xs" c="dimmed">"{src.text_preview}"</Text>
                        </Box>
                      )}
                    </Paper>
                  ))}
                </Stack>
              </Box>
            )}
          </Paper>
        )}
      </Box>
    );
  };

  return (
    <>
      <Modal opened={renameModalOpened} onClose={() => setRenameModalOpened(false)} title="Rename Conversation" centered>
        <TextInput
          label="New Title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.currentTarget.value)}
          data-autofocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setRenameModalOpened(false)}>Cancel</Button>
          <Button onClick={handleRename}>Save</Button>
        </Group>
      </Modal>

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
            <ActionIcon variant="default" size="sm" onClick={startNewChat}>
              <IconPlus size={16} />
            </ActionIcon>
          </Group>
        </Box>
        <ScrollArea style={{ flex: 1 }} p="xs">
          {conversations.length === 0 ? (
            <Center h={100}>
              <Text size="sm" c="dimmed">No past conversations</Text>
            </Center>
          ) : (
            <Stack gap={2}>
              {[...conversations].sort((a, b) => b.is_pinned - a.is_pinned).map(conv => (
                <Paper 
                  key={conv.conversation_id} 
                  p={6} 
                  radius="sm" 
                  style={{ 
                    cursor: 'pointer', 
                    backgroundColor: currentConversationId === conv.conversation_id ? '#eef2ff' : 'transparent',
                    border: currentConversationId === conv.conversation_id ? '1px solid #c7d2fe' : '1px solid transparent',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => navigate(`/chat/${conv.conversation_id}`)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" style={{ flex: 1, overflow: 'hidden' }} wrap="nowrap">
                      {conv.is_pinned && <IconPinFilled size={12} style={{ flexShrink: 0, color: '#f59f00' }} />}
                      <Text size="sm" fw={currentConversationId === conv.conversation_id ? 600 : 500} lineClamp={1}>
                        {conv.title}
                      </Text>
                    </Group>
                    <Menu shadow="md" width={150} position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPencil size={14} />} onClick={(e) => { e.stopPropagation(); setConversationToRename(conv); setNewTitle(conv.title); setRenameModalOpened(true); }}>
                          Rename
                        </Menu.Item>
                        <Menu.Item leftSection={<IconPin size={14} />} onClick={(e) => handlePin(conv, e)}>
                          {conv.is_pinned ? 'Unpin' : 'Pin'}
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e) => handleDelete(conv, e)}>
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
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
        {loading && messages.length === 0 ? (
          <Flex flex={1} align="center" justify="center" direction="column">
            <Loader color="blue" size="md" type="dots" />
            <Text mt="md" size="sm" c="dimmed">Loading conversation...</Text>
          </Flex>
        ) : messages.length === 0 ? (
          <Flex flex={1} align="center" justify="center" direction="column" style={{ opacity: 0.6 }}>
            <IconMessageCircle2 size={60} color="#ccc" style={{ marginBottom: 16 }} />
            <Title order={3} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#666' }}>Ready to dive in?</Title>
            <Text c="dimmed" mt="xs" maw={400} ta="center">
              Select a scope and uncover the insights hidden in your notes!
            </Text>
          </Flex>
        ) : (
          <ScrollArea style={{ flex: 1 }} px="xl" viewportRef={scrollRef}>
            <Stack spacing="xl" style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 0' }}>
              {messages.map((msg, i) => (
                <Group key={i} align="flex-start" justify={msg.role === 'user' ? 'flex-end' : 'flex-start'} wrap="nowrap" mt="md">
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
                    <Box style={{ width: '100%', padding: '0 8px' }}>
                      <Box style={{ fontSize: '15px', lineHeight: 1.6, color: '#171738' }}>
                        {renderMessageContent(msg.text, msg.detailed_sources)}
                      </Box>
                      <MetadataBlock msg={msg} messageIndex={i} />
                    </Box>
                  )}
                </Group>
              ))}
              {loading && (
                <Group align="flex-start" wrap="nowrap" mt="md">
                  <Box style={{ padding: '0 8px' }}>
                    <Group gap="xs">
                      <Loader size="xs" type="dots" color="indigo" />
                      <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                        {taskStatus?.progress_message || 'Thinking...'}
                      </Text>
                    </Group>
                  </Box>
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
    </>
  );
}
