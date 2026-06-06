import { useState, useEffect } from 'react';
import { Box, Container, Title, Text, Button, Center, Loader, Select, ScrollArea, Group, ActionIcon, Stack, Paper, Modal, Progress } from '@mantine/core';
import { IconArrowLeft, IconRobot, IconAlertCircle, IconFileText, IconCheck } from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function SummaryView() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const lectureId = searchParams.get('lecture_id');

  const [summaries, setSummaries] = useState([]);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [summaryContent, setSummaryContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);
  const [taskStatus, setTaskStatus] = useState(null);

  const [mode, setMode] = useState('normal');
  const [outputFormat, setOutputFormat] = useState('sentence');
  const [processingMethod, setProcessingMethod] = useState('whole');

  useEffect(() => {
    if (!lectureId) {
      navigate('/dashboard');
      return;
    }
    loadSummaries();
    
    // Initial task check
    checkTaskStatus();
  }, [lectureId]);

  useEffect(() => {
    let interval;
    if (generating) {
      interval = setInterval(checkTaskStatus, 2000);
    }
    return () => clearInterval(interval);
  }, [generating]);

  const checkTaskStatus = async () => {
    try {
      const statusData = await fetchApi(`/search/task?lecture_id=${lectureId}`);
      if (statusData && statusData.task_type === 'summary_generation') {
        setTaskStatus(statusData);
        if (statusData.status === 'completed' || statusData.status === 'failed') {
          setGenerating(false);
          loadSummaries();
        } else {
          setGenerating(true);
        }
      } else {
        // No active summary task
        if (generating && taskStatus && taskStatus.status !== 'completed' && taskStatus.status !== 'failed') {
          // If we were generating but task disappeared, maybe it finished quickly
          setGenerating(false);
          loadSummaries();
        }
      }
    } catch (e) {
      console.error("Failed to fetch task status", e);
    }
  };

  const loadSummaries = async () => {
    try {
      setLoading(true);
      const data = await fetchApi(`/summaries?lecture_id=${lectureId}`);
      const filtered = data.filter(d => d.summary_type === 'summary').sort((a, b) => b.version - a.version);
      setSummaries(filtered);
      if (filtered.length > 0) {
        loadSummaryContent(filtered[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to load summaries", err);
      setError("Failed to load summaries");
      setLoading(false);
    }
  };

  const loadSummaryContent = async (summaryId) => {
    try {
      setLoading(true);
      const data = await fetchApi(`/summaries/${summaryId}`);
      setSelectedSummary(data);
      setSummaryContent(data.content);
    } catch (err) {
      console.error("Failed to load summary content", err);
      setError("Failed to load summary content");
    } finally {
      setLoading(false);
    }
  };

  const startGenerateSummary = async () => {
    try {
      setGenerating(true);
      setModalOpened(false);
      await fetchApi('/summaries/summary', {
        method: 'POST',
        body: JSON.stringify({
          lecture_id: lectureId,
          mode: mode,
          output_format: outputFormat,
          processing_method: processingMethod
        })
      });
      checkTaskStatus();
    } catch (err) {
      console.error("Failed to generate summary", err);
      setError("Failed to start summary generation");
      setGenerating(false);
    }
  };

  if (!lectureId) return null;

  const isFailed = taskStatus?.status === 'failed';
  const processingProgress = taskStatus?.progress || 10;

  return (
    <Box h="100vh" style={{ display: 'flex', flexDirection: 'column' }}>
      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Summary Parameters" centered>
        <Stack>
          <Select 
            label="AI Mode" 
            data={[
              { value: 'quick', label: 'Quick' },
              { value: 'simple', label: 'Simple' },
              { value: 'normal', label: 'Normal' },
              { value: 'elaborate', label: 'Elaborate' },
              { value: 'eli5', label: 'Explain like I am 5' }
            ]} 
            value={mode} 
            onChange={setMode} 
          />
          <Select 
            label="Output Format" 
            data={[
              { value: 'sentence', label: 'Sentence' },
              { value: 'pointform', label: 'Pointform' },
              { value: 'numbered_list', label: 'Numbered List' },
              { value: 'table', label: 'Table' }
            ]} 
            value={outputFormat} 
            onChange={setOutputFormat} 
          />
          <Select 
            label="Processing Method" 
            data={[
              { value: 'whole', label: 'Whole Document (Fast)' },
              { value: 'chunked', label: 'Chunked (Detailed)' },
              { value: 'hierarchical', label: 'Hierarchical (Structured)' }
            ]} 
            value={processingMethod} 
            onChange={setProcessingMethod} 
          />
          <Button fullWidth mt="md" onClick={startGenerateSummary}>Start Generation</Button>
        </Stack>
      </Modal>

      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 20 }}>
        <Group justify="space-between" align="center" maw={1200} mx="auto" w="100%">
          <Group gap="sm">
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => navigate(`/lecture/${lectureId}`)}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" letterSpacing={1}>AI Summary</Text>
              <Title order={3} fw={800} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
                {selectedSummary ? selectedSummary.title : "Lecture Summaries"}
              </Title>
            </div>
          </Group>
          <Group>
             <Button variant="light" onClick={() => setModalOpened(true)} loading={generating} leftSection={<IconRobot size={18} />}>
               Generate New Summary
             </Button>
          </Group>
        </Group>
      </Box>

      <Box style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ScrollArea style={{ flex: 1, backgroundColor: '#fff' }} p={0}>
          <Container size="md" p={0} py="xl">
            {generating ? (
              <Box mt={100} ta="center">
                <IconRobot size={64} color="var(--mantine-color-blue-6)" stroke={1.5} style={{ opacity: 0.8 }} />
                <Title order={2} mt="xl" mb="sm" fw={800} c="#171738">Generating Summary...</Title>
                <Text c="dimmed" mb="xl" size="lg" maw={500} mx="auto">
                  Our AI is analyzing the notes and generating your customized summary.
                </Text>
                <Box maw={400} mx="auto">
                  <Progress value={processingProgress} animated striped color="blue" size="xl" radius="xl" />
                  <Text size="sm" c="dimmed" mt="xs" ta="right">{processingProgress}%</Text>
                </Box>
              </Box>
            ) : isFailed ? (
               <Box mt={100} ta="center">
                <IconAlertCircle size={64} color="var(--mantine-color-red-6)" stroke={1.5} />
                <Title order={2} mt="xl" mb="sm" fw={800} c="red">Processing Failed</Title>
                <Text c="dimmed" mb="xl" size="lg" maw={500} mx="auto">
                  {taskStatus?.error || 'An unexpected error occurred while generating the summary.'}
                </Text>
               </Box>
            ) : loading ? (
              <Center h="50vh"><Loader size="lg" /></Center>
            ) : error ? (
              <Center h="50vh">
                <Stack align="center">
                  <IconAlertCircle size={48} color="red" />
                  <Text c="red">{error}</Text>
                </Stack>
              </Center>
            ) : summaries.length === 0 ? (
              <Center h="50vh">
                <Stack align="center">
                  <IconFileText size={64} color="var(--mantine-color-gray-3)" />
                  <Title order={3} c="dimmed">No Summaries Yet</Title>
                  <Text c="dimmed">Generate a summary to get started.</Text>
                  <Button mt="md" onClick={() => setModalOpened(true)} loading={generating}>Generate First Summary</Button>
                </Stack>
              </Center>
            ) : (
              <Box className="markdown-content" style={{ color: '#171738', fontSize: '16px', lineHeight: 1.8 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summaryContent}
                </ReactMarkdown>
              </Box>
            )}
          </Container>
        </ScrollArea>

        {/* Right Sidebar for Versions */}
        <Box w={280} style={{ borderLeft: '1px solid #eaeaea', backgroundColor: '#fafafa', overflowY: 'auto' }} p="md">
          <Title order={5} fw={600} c="dimmed" mb="md">Versions</Title>
          <Stack gap="xs">
            {summaries.map(summary => (
              <Paper 
                key={summary.id} 
                p="sm" 
                withBorder 
                style={{ 
                  cursor: 'pointer', 
                  borderColor: selectedSummary?.id === summary.id ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)',
                  backgroundColor: selectedSummary?.id === summary.id ? 'var(--mantine-color-blue-0)' : '#fff'
                }}
                onClick={() => loadSummaryContent(summary.id)}
              >
                <Group justify="space-between">
                  <Text size="sm" fw={selectedSummary?.id === summary.id ? 700 : 500}>
                    Version {summary.version}
                  </Text>
                  {selectedSummary?.id === summary.id && <IconCheck size={16} color="var(--mantine-color-blue-6)" />}
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {new Date(summary.created_at).toLocaleString()}
                </Text>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
