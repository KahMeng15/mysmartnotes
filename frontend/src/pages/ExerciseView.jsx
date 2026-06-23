import { useState, useEffect } from 'react';
import { 
  Box, Title, Text, Group, Card, Button, Stack, Loader, Center, 
  Badge, ActionIcon, Textarea, Collapse, Radio, Paper, Alert, Menu
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconCheck, IconX, IconBulb, IconBook, IconDownload, IconFileTypePdf, IconFileTypeDocx } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function ExerciseView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);

  // User input and feedback state mapped by question id
  const [userAnswers, setUserAnswers] = useState({});
  const [gradingResults, setGradingResults] = useState({});
  const [explanations, setExplanations] = useState({});
  const [gradingLoading, setGradingLoading] = useState({});
  const [explainLoading, setExplainLoading] = useState({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchApi(`/exercises/${id}`)
      .then(data => {
        setExercise(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        alert("Failed to load exercise");
        setLoading(false);
      });
  }, [id]);

  const handleGrade = async (qId) => {
    const answer = userAnswers[qId];
    if (!answer?.trim()) return;

    setGradingLoading(prev => ({ ...prev, [qId]: true }));
    try {
      const res = await fetchApi(`/exercises/questions/${qId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ user_answer: answer })
      });
      setGradingResults(prev => ({ ...prev, [qId]: res }));
    } catch (e) {
      alert("Failed to grade answer: " + e.message);
    } finally {
      setGradingLoading(prev => ({ ...prev, [qId]: false }));
    }
  };

  const handleExplain = async (qId) => {
    setExplainLoading(prev => ({ ...prev, [qId]: true }));
    try {
      const res = await fetchApi(`/exercises/questions/${qId}/explain`, {
        method: 'POST',
        body: JSON.stringify({ user_answer: userAnswers[qId] || "" })
      });
      setExplanations(prev => ({ ...prev, [qId]: res.explanation }));
    } catch (e) {
      alert("Failed to get explanation: " + e.message);
    } finally {
      setExplainLoading(prev => ({ ...prev, [qId]: false }));
    }
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const res = await fetchApi(`/exercises/${id}/export`, {
        method: 'POST',
        body: JSON.stringify({ format, include_cover: true })
      });
      if (res && res.task_id) {
        // Poll for export completion
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetchApi(`/exercises/${id}/export-status/${res.task_id}`);
            if (statusRes.status === 'complete') {
              clearInterval(interval);
              window.location.href = res.download_url;
              setExporting(false);
            } else if (statusRes.status === 'failed') {
              clearInterval(interval);
              alert("Export failed.");
              setExporting(false);
            }
          } catch (e) {
            clearInterval(interval);
            setExporting(false);
          }
        }, 2000);
      }
    } catch (e) {
      alert("Failed to start export: " + e.message);
      setExporting(false);
    }
  };

  if (loading) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  if (!exercise) {
    return <Center h="50vh"><Text>Exercise not found.</Text></Center>;
  }

  return (
    <Box>
      <Group mb="lg">
        <ActionIcon variant="subtle" onClick={() => navigate(`/subject/${exercise.subject_id}`)}>
          <IconArrowLeft />
        </ActionIcon>
        <Title order={2}>{exercise.title}</Title>
        {!exercise.questions?.length && (
           <Badge color="orange">Processing or Empty</Badge>
        )}
      </Group>

      <Group mb="xl" justify="space-between">
        <Group>
           <Button variant={showAllAnswers ? "filled" : "light"} onClick={() => setShowAllAnswers(!showAllAnswers)}>
             {showAllAnswers ? "Hide All Answers" : "Show All Answers"}
           </Button>
           <Button variant={isTestMode ? "filled" : "light"} color="indigo" onClick={() => setIsTestMode(!isTestMode)}>
             {isTestMode ? "Exit Test Mode" : "Enter Test Mode"}
           </Button>
           <Menu shadow="md" width={200}>
             <Menu.Target>
               <Button variant="outline" color="gray" leftSection={<IconDownload size={16} />} loading={exporting}>
                 Export
               </Button>
             </Menu.Target>
             <Menu.Dropdown>
               <Menu.Item leftSection={<IconFileTypePdf size={14} color="red" />} onClick={() => handleExport('pdf')}>
                 Export as PDF
               </Menu.Item>
               <Menu.Item leftSection={<IconFileTypeDocx size={14} color="blue" />} onClick={() => handleExport('docx')}>
                 Export as DOCX
               </Menu.Item>
             </Menu.Dropdown>
           </Menu>
        </Group>
      </Group>

      <Stack spacing="xl">
        {exercise.questions?.sort((a, b) => a.order - b.order).map(q => {
          const showAns = showAllAnswers || gradingResults[q.id];
          const hasGraded = !!gradingResults[q.id];
          const grade = gradingResults[q.id];
          const explanation = explanations[q.id] || q.explanation;

          return (
            <Card key={q.id} shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" align="flex-start" mb="sm">
                <Text fw={600} size="lg">
                  {q.original_number ? `${q.original_number}. ` : ""}{q.question_text}
                </Text>
                {q.reference_note_id && (
                  <Badge 
                    leftSection={<IconBook size={12} />} 
                    variant="dot" 
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/resource/${q.reference_note_id}`)}
                  >
                    View Source
                  </Badge>
                )}
              </Group>

              {isTestMode ? (
                <Box mt="md">
                  {q.options?.length > 0 ? (
                     <Radio.Group
                       value={userAnswers[q.id] || ''}
                       onChange={(v) => setUserAnswers({...userAnswers, [q.id]: v})}
                     >
                       <Stack mt="xs">
                         {q.options.map((opt, i) => (
                           <Radio key={i} value={opt} label={opt} disabled={hasGraded} />
                         ))}
                       </Stack>
                     </Radio.Group>
                  ) : (
                    <Textarea 
                      placeholder="Type your answer here..."
                      value={userAnswers[q.id] || ''}
                      onChange={(e) => setUserAnswers({...userAnswers, [q.id]: e.currentTarget.value})}
                      minRows={3}
                      disabled={hasGraded}
                    />
                  )}
                  
                  <Group mt="md">
                    <Button 
                      loading={gradingLoading[q.id]} 
                      onClick={() => handleGrade(q.id)}
                      disabled={hasGraded || !userAnswers[q.id]}
                    >
                      Check Answer
                    </Button>
                    {hasGraded && (
                      <Button variant="light" color="grape" loading={explainLoading[q.id]} onClick={() => handleExplain(q.id)} leftSection={<IconBulb size={16} />}>
                        Explain Correct Answer
                      </Button>
                    )}
                  </Group>

                  <Collapse in={hasGraded ? "true" : undefined}>
                    <Alert 
                      mt="md" 
                      color={grade?.is_correct ? 'green' : 'red'} 
                      icon={grade?.is_correct ? <IconCheck /> : <IconX />}
                    >
                      <Text fw={500}>{grade?.feedback}</Text>
                      {!grade?.is_correct && (
                        <Text mt="xs" size="sm"><b>Correct Answer:</b> {grade?.correct_answer}</Text>
                      )}
                    </Alert>
                  </Collapse>
                  
                  <Collapse in={!!explanation ? "true" : undefined}>
                     <Paper mt="md" p="md" bg="var(--mantine-color-gray-0)">
                       <Text size="sm"><IconBulb size={14} style={{ marginRight: 5, verticalAlign: 'middle' }}/><b>AI Explanation:</b> {explanation}</Text>
                     </Paper>
                  </Collapse>
                </Box>
              ) : (
                <Box mt="md">
                  <Collapse in={showAns ? "true" : undefined}>
                    <Paper p="md" bg="var(--mantine-color-blue-0)" radius="sm">
                      <Text fw={500} c="blue.9">Answer:</Text>
                      <Text c="blue.9">{q.answer_text || "No answer provided."}</Text>
                    </Paper>
                    
                    {explanation && (
                      <Paper mt="sm" p="md" bg="var(--mantine-color-gray-0)" radius="sm">
                        <Text size="sm"><IconBulb size={14} style={{ marginRight: 5, verticalAlign: 'middle' }}/><b>Explanation:</b> {explanation}</Text>
                      </Paper>
                    )}
                    
                    {!explanation && (
                       <Button mt="sm" size="xs" variant="subtle" color="grape" loading={explainLoading[q.id]} onClick={() => handleExplain(q.id)}>
                         Generate Explanation
                       </Button>
                    )}
                  </Collapse>
                </Box>
              )}
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
