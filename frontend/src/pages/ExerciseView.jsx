import { useState, useEffect, useRef } from 'react';
import { 
  Box, Title, Text, Group, Card, Button, Stack, Loader, Center, 
  Badge, ActionIcon, Textarea, Collapse, Radio, Paper, Alert, Menu,
  Grid, Select, SegmentedControl, TextInput, Divider, NumberInput, Switch,
  Container, ScrollArea, Tooltip, NavLink as MantineNavLink
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconCheck, IconX, IconBulb, IconBook, IconDownload, IconFileTypePdf, IconFileTypeDocx, IconEdit, IconTrash, IconPlus, IconClock, IconDeviceFloppy, IconChevronLeft, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconPencil, IconEyeOff, IconEye, IconMessageDots, IconDotsVertical, IconRefresh } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function ExerciseView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);

  // Layout & Mode state
  const [viewMode, setViewMode] = useState('hide'); // hide, show, interactive, exam, conversation
  const [editMode, setEditMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Exam state
  const [examTimerMinutes, setExamTimerMinutes] = useState(15);
  const [examTimeRemaining, setExamTimeRemaining] = useState(null); // seconds
  const [examActive, setExamActive] = useState(false);
  const timerRef = useRef(null);

  // User input and feedback state
  const [userAnswers, setUserAnswers] = useState({});
  const [gradingResults, setGradingResults] = useState({});
  const [explanations, setExplanations] = useState({});
  const [gradingLoading, setGradingLoading] = useState({});
  const [explainLoading, setExplainLoading] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [showExplanations, setShowExplanations] = useState({});

  // Editing state
  const [editedQuestions, setEditedQuestions] = useState([]);
  const [savingEdits, setSavingEdits] = useState(false);

  useEffect(() => {
    fetchApi(`/exercises/${id}`)
      .then(data => {
        setExercise(data);
        setEditedQuestions(JSON.parse(JSON.stringify(data.questions || [])));
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        alert("Failed to load exercise");
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (examActive && examTimeRemaining !== null) {
      if (examTimeRemaining <= 0) {
        clearInterval(timerRef.current);
        handleSubmitExam();
      } else {
        timerRef.current = setInterval(() => {
          setExamTimeRemaining(prev => prev - 1);
        }, 1000);
      }
    }
    return () => clearInterval(timerRef.current);
  }, [examActive, examTimeRemaining]);

  const handleGrade = async (qId) => {
    const answer = userAnswers[qId] || '';
    if (!answer.trim()) return;

    const question = exercise.questions.find(q => q.id === qId);
    if (!question) return;

    // Client-side auto-grade for objective/fill-in-the-blank
    if (question.question_type === 'objective' || question.question_type === 'fill_in_the_blank') {
      const correctAns = question.answer_text.trim().toLowerCase();
      const userAns = answer.trim().toLowerCase();
      const isCorrect = userAns === correctAns || correctAns.includes(userAns) || userAns.includes(correctAns);
      setGradingResults(prev => ({ 
        ...prev, 
        [qId]: { is_correct: isCorrect, feedback: isCorrect ? "Correct!" : "Incorrect.", correct_answer: question.answer_text } 
      }));
      return;
    }

    // AI grading for subjective
    setGradingLoading(prev => ({ ...prev, [qId]: true }));
    try {
      const res = await fetchApi(`/exercises/${id}/questions/${qId}/grade`, {
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

  const handleCheckAll = async () => {
    const promises = (exercise.questions || []).map(q => {
      if (!userAnswers[q.id]) return Promise.resolve();
      if (!gradingResults[q.id]) {
        return handleGrade(q.id);
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
  };

  const handleExplain = async (qId) => {
    setExplainLoading(prev => ({ ...prev, [qId]: true }));
    try {
      const res = await fetchApi(`/exercises/${id}/questions/${qId}/explain`, {
        method: 'POST',
        body: JSON.stringify({ user_answer: userAnswers[qId] || "" })
      });
      setExplanations(prev => ({ ...prev, [qId]: res.explanation }));
      setShowExplanations(prev => ({ ...prev, [qId]: true }));
    } catch (e) {
      alert("Failed to get explanation: " + e.message);
    } finally {
      setExplainLoading(prev => ({ ...prev, [qId]: false }));
    }
  };

  const handleDeleteExplanation = async (qId) => {
    try {
      await fetchApi(`/exercises/${id}/questions/${qId}/explain`, {
        method: 'DELETE'
      });
      setExplanations(prev => ({ ...prev, [qId]: null }));
      setShowExplanations(prev => ({ ...prev, [qId]: false }));
    } catch (e) {
      alert("Failed to delete explanation: " + e.message);
    }
  };

  const handleResetQuestion = (qId) => {
    setUserAnswers(prev => ({ ...prev, [qId]: "" }));
    setGradingResults(prev => {
      const newResults = { ...prev };
      delete newResults[qId];
      return newResults;
    });
    setShowExplanations(prev => {
      const newShow = { ...prev };
      delete newShow[qId];
      return newShow;
    });
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const res = await fetchApi(`/exercises/${id}/export`, {
        method: 'POST',
        body: JSON.stringify({ format, include_cover: true })
      });
      if (res && res.task_id) {
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

  const handleStartExam = () => {
    setExamTimeRemaining(examTimerMinutes * 60);
    setExamActive(true);
    setUserAnswers({});
    setGradingResults({});
    setExplanations({});
    setRevealedAnswers({});
  };

  const handleSubmitExam = () => {
    setExamActive(false);
    clearInterval(timerRef.current);
    handleCheckAll();
  };

  const toggleReveal = (qId) => {
    setRevealedAnswers(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const handleSaveEdits = async () => {
    setSavingEdits(true);
    try {
      const res = await fetchApi(`/exercises/${id}/content`, {
        method: 'PUT',
        body: JSON.stringify({ questions: editedQuestions })
      });
      setExercise(res);
      setEditMode(false);
    } catch (e) {
      alert("Failed to save exercise: " + e.message);
    } finally {
      setSavingEdits(false);
    }
  };

  if (loading) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  if (!exercise) {
    return <Center h="50vh"><Text>Exercise not found.</Text></Center>;
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Box h="100vh" style={{ display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
      {/* Sticky Header */}
      <Box py="xs" px="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 20 }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate(-1)}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            {exercise?.subject && (
              <Group gap="xs" ml="xs">
                {exercise.subject.group && (
                  <>
                    <Text size="sm" fw={500} c="dimmed" style={{ cursor: 'pointer' }} onClick={() => navigate(`/group/${exercise.subject.group.id}`)}>{exercise.subject.group.name}</Text>
                    <Text size="sm" c="dimmed">/</Text>
                  </>
                )}
                <Text size="sm" fw={500} c="dimmed" style={{ cursor: 'pointer' }} onClick={() => navigate(`/subject/${exercise.subject.id}`)}>{exercise.subject.name}</Text>
                <Text size="sm" c="dimmed">/</Text>
                <Text size="sm" fw={500} c="dimmed">Exercise</Text>
              </Group>
            )}
          </Group>
        </Group>
      </Box>

      <Box style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ScrollArea 
          style={{ flex: 1, backgroundColor: '#fff' }} 
          p={0}
        >
          <Container size="md" p={0} pt={0} pb="xl">
            <Box px="md">
              <div className="summary-header" style={{ marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                <Group justify="space-between">
                  <Title order={1} style={{ marginTop: 0, marginBottom: 0, color: '#171738', fontWeight: 700 }}>
                    {exercise.title}
                  </Title>
                  {examActive && (
                    <Badge color={examTimeRemaining < 60 ? "red" : "blue"} size="lg" leftSection={<IconClock size={14} />}>
                      {formatTime(examTimeRemaining)}
                    </Badge>
                  )}
                </Group>
              </div>

              <Stack spacing="xl">
                {editMode ? (
                  <Box>
                    <Text fw={600} mb="md">Edit Questions (Changes saved to JSON)</Text>
                    {editedQuestions.map((q, idx) => (
                      <Card key={idx} withBorder mb="sm" shadow="xs">
                        <Group justify="space-between" mb="xs">
                          <Text fw={500}>Question {idx + 1}</Text>
                          <ActionIcon color="red" variant="subtle" onClick={() => {
                            const newQs = [...editedQuestions];
                            newQs.splice(idx, 1);
                            setEditedQuestions(newQs);
                          }}><IconTrash size={16} /></ActionIcon>
                        </Group>
                        <Stack spacing="xs">
                          <Select 
                            label="Type" 
                            data={['subjective', 'objective', 'fill_in_the_blank']} 
                            value={q.question_type} 
                            onChange={(v) => {
                              const newQs = [...editedQuestions];
                              newQs[idx].question_type = v;
                              setEditedQuestions(newQs);
                            }}
                          />
                          <Textarea label="Question Text" value={q.question_text} onChange={(e) => {
                            const newQs = [...editedQuestions];
                            newQs[idx].question_text = e.currentTarget.value;
                            setEditedQuestions(newQs);
                          }} />
                          <Textarea label="Correct Answer" value={q.answer_text} onChange={(e) => {
                            const newQs = [...editedQuestions];
                            newQs[idx].answer_text = e.currentTarget.value;
                            setEditedQuestions(newQs);
                          }} />
                          {q.question_type === 'objective' && (
                            <Textarea label="Options (JSON Array)" value={typeof q.options === 'string' ? q.options : JSON.stringify(q.options || [])} onChange={(e) => {
                              const newQs = [...editedQuestions];
                              newQs[idx].options = e.currentTarget.value;
                              setEditedQuestions(newQs);
                            }} />
                          )}
                        </Stack>
                      </Card>
                    ))}
                    <Button variant="light" fullWidth leftSection={<IconPlus size={16} />} onClick={() => {
                      setEditedQuestions([...editedQuestions, { id: String(Date.now()), question_type: 'subjective', question_text: '', answer_text: '' }]);
                    }}>Add Question</Button>
                  </Box>
                ) : (
                  (exercise.questions || []).map((q, idx) => {
                    const isExam = viewMode === 'exam';
                    const isInteractive = viewMode === 'interactive' || isExam;
                    const hasGraded = !!gradingResults[q.id];
                    const grade = gradingResults[q.id];
                    const explanation = explanations[q.id] || q.explanation;
                    
                    let showAns = false;
                    if (viewMode === 'show') showAns = true;
                    if (viewMode === 'hide' && revealedAnswers[q.id]) showAns = true;
                    if (isInteractive && hasGraded) showAns = true;

                    let parsedOptions = [];
                    try {
                      parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
                    } catch(e) { parsedOptions = []; }

                    return (
                      <Card key={q.id} shadow="sm" padding="lg" radius="md" withBorder>
                        <Group justify="space-between" align="flex-start" mb="sm">
                          <Text fw={600} size="lg">
                            {idx + 1}. {q.question_text}
                          </Text>
                          {q.reference_resource_id && (
                            <Badge 
                              leftSection={<IconBook size={12} />} 
                              variant="dot" 
                              style={{ cursor: 'pointer' }}
                              onClick={() => navigate(`/resource/${q.reference_resource_id}`)}
                            >
                              View Source
                            </Badge>
                          )}
                        </Group>

                        {isInteractive ? (
                          <Box mt="md">
                            {parsedOptions.length > 0 ? (
                               <Radio.Group
                                 value={userAnswers[q.id] || ''}
                                 onChange={(v) => setUserAnswers({...userAnswers, [q.id]: v})}
                               >
                                 <Stack mt="xs">
                                   {parsedOptions.map((opt, i) => (
                                     <Radio key={i} value={opt} label={opt} disabled={hasGraded || (isExam && !examActive)} />
                                   ))}
                                 </Stack>
                               </Radio.Group>
                            ) : (
                              <Textarea 
                                placeholder="Type your answer here..."
                                value={userAnswers[q.id] || ''}
                                onChange={(e) => setUserAnswers({...userAnswers, [q.id]: e.currentTarget.value})}
                                minRows={2}
                                disabled={hasGraded || (isExam && !examActive)}
                              />
                            )}
                            
                            {!isExam && (
                              <Group mt="md">
                                {!hasGraded ? (
                                  <Button 
                                    loading={gradingLoading[q.id]} 
                                    onClick={() => handleGrade(q.id)}
                                    disabled={!userAnswers[q.id]}
                                  >
                                    Check Answer
                                  </Button>
                                ) : (
                                  <>
                                    <Button variant="light" color="gray" onClick={() => handleResetQuestion(q.id)} leftSection={<IconRefresh size={16} />}>
                                      Reset
                                    </Button>
                                    {!explanation && (
                                      <Button variant="light" color="grape" loading={explainLoading[q.id]} onClick={() => handleExplain(q.id)} leftSection={<IconBulb size={16} />}>
                                        Ask AI to Explain
                                      </Button>
                                    )}
                                    {explanation && !showExplanations[q.id] && (
                                      <Button variant="light" color="grape" onClick={() => setShowExplanations(prev => ({...prev, [q.id]: true}))} leftSection={<IconBulb size={16} />}>
                                        Show AI Explanation
                                      </Button>
                                    )}
                                  </>
                                )}
                              </Group>
                            )}

                            {hasGraded && (
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
                            )}
                            
                            {explanation && showExplanations[q.id] && (
                                <Paper mt="md" p="md" bg="var(--mantine-color-white)" radius="sm" withBorder>
                                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    {explainLoading[q.id] ? (
                                       <Group gap="xs"><Loader size="xs" color="grape" /><Text size="sm" c="dimmed">Regenerating explanation...</Text></Group>
                                    ) : (
                                      <>
                                        <Text size="sm"><IconBulb size={14} style={{ marginRight: 5, verticalAlign: 'middle', color: 'var(--mantine-color-grape-6)' }}/><b>Explanation:</b> {explanation}</Text>
                                        <Menu position="bottom-end" shadow="sm">
                                          <Menu.Target>
                                            <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                                              <IconDotsVertical size={14} />
                                            </ActionIcon>
                                          </Menu.Target>
                                          <Menu.Dropdown>
                                            <Menu.Item leftSection={<IconRefresh size={14} />} onClick={(e) => { e.stopPropagation(); handleExplain(q.id); }}>
                                              Regenerate Explanation
                                            </Menu.Item>
                                            <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={(e) => { e.stopPropagation(); setShowExplanations(prev => ({ ...prev, [q.id]: false })); }}>
                                              Hide Explanation
                                            </Menu.Item>
                                            <Menu.Divider />
                                            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e) => { e.stopPropagation(); handleDeleteExplanation(q.id); }}>
                                              Delete Explanation
                                            </Menu.Item>
                                          </Menu.Dropdown>
                                        </Menu>
                                      </>
                                    )}
                                  </Group>
                                </Paper>
                            )}
                          </Box>
                        ) : (
                          <Box mt="md">
                            {(showAns || viewMode === 'hide') && (
                              <Box>
                                <Paper 
                                  p="md" 
                                  bg="var(--mantine-color-blue-0)" 
                                  radius="sm"
                                  style={{
                                    cursor: !showAns ? 'pointer' : 'default',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onClick={() => {
                                    if (!showAns && viewMode === 'hide') {
                                      toggleReveal(q.id);
                                    }
                                  }}
                                >
                                  {!showAns && (
                                    <Center style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, background: 'rgba(231, 245, 255, 0.3)' }}>
                                      <Badge size="lg" variant="light" color="blue" style={{ pointerEvents: 'none' }}>
                                        Click to reveal answer
                                      </Badge>
                                    </Center>
                                  )}
                                  <Box style={{ filter: !showAns ? 'blur(6px)' : 'none', opacity: !showAns ? 0.5 : 1, transition: 'filter 0.3s ease, opacity 0.3s ease', userSelect: !showAns ? 'none' : 'auto', pointerEvents: !showAns ? 'none' : 'auto' }}>
                                    <Text fw={500} c="blue.9">Answer:</Text>
                                    <Text c="blue.9">{q.answer_text || "No answer provided."}</Text>
                                    
                                    <Box mt="md">
                                      {explanation && !showExplanations[q.id] && (
                                        <Button size="xs" variant="light" color="grape" mb="sm" onClick={(e) => { e.stopPropagation(); setShowExplanations(prev => ({ ...prev, [q.id]: true })); }} leftSection={<IconBulb size={14} />}>
                                          Show AI Explanation
                                        </Button>
                                      )}
                                      {explanation && showExplanations[q.id] && (
                                        <Paper p="md" bg="var(--mantine-color-white)" radius="sm" mb="sm">
                                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                                            {explainLoading[q.id] ? (
                                               <Group gap="xs"><Loader size="xs" color="grape" /><Text size="sm" c="dimmed">Regenerating explanation...</Text></Group>
                                            ) : (
                                              <>
                                                <Text size="sm"><IconBulb size={14} style={{ marginRight: 5, verticalAlign: 'middle', color: 'var(--mantine-color-grape-6)' }}/><b>Explanation:</b> {explanation}</Text>
                                                <Menu position="bottom-end" shadow="sm">
                                                  <Menu.Target>
                                                    <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                                                      <IconDotsVertical size={14} />
                                                    </ActionIcon>
                                                  </Menu.Target>
                                                  <Menu.Dropdown>
                                                    <Menu.Item leftSection={<IconRefresh size={14} />} onClick={(e) => { e.stopPropagation(); handleExplain(q.id); }}>
                                                      Regenerate
                                                    </Menu.Item>
                                                    <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={(e) => { e.stopPropagation(); setShowExplanations(prev => ({ ...prev, [q.id]: false })); }}>
                                                      Hide
                                                    </Menu.Item>
                                                    <Menu.Divider />
                                                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e) => { e.stopPropagation(); handleDeleteExplanation(q.id); }}>
                                                      Delete
                                                    </Menu.Item>
                                                  </Menu.Dropdown>
                                                </Menu>
                                              </>
                                            )}
                                          </Group>
                                        </Paper>
                                      )}
                                      <Group gap="xs">
                                        {!explanation && (
                                          <Button size="xs" variant="light" color="grape" loading={explainLoading[q.id]} onClick={(e) => { e.stopPropagation(); handleExplain(q.id); }} leftSection={<IconBulb size={14} />}>
                                            Ask AI to Explain
                                          </Button>
                                        )}
                                        {viewMode === 'hide' && (
                                          <Button size="xs" variant="subtle" color="gray" onClick={(e) => { e.stopPropagation(); toggleReveal(q.id); }} leftSection={showAns ? <IconEyeOff size={14} /> : <IconEye size={14} />}>
                                            {showAns ? "Re-hide Answer" : "Reveal Answer"}
                                          </Button>
                                        )}
                                      </Group>
                                    </Box>
                                  </Box>
                                </Paper>
                              </Box>
                            )}
                          </Box>
                        )}
                      </Card>
                    );
                  })
                )}

                {!editMode && viewMode === 'interactive' && exercise.questions?.length > 0 && (
                  <Button size="lg" color="blue" onClick={handleCheckAll} mb="xl">
                    Check All Answers
                  </Button>
                )}
                
                {!editMode && viewMode === 'exam' && exercise.questions?.length > 0 && examActive && (
                  <Button size="lg" color="red" onClick={handleSubmitExam} mb="xl">
                    Submit Exam
                  </Button>
                )}
              </Stack>
            </Box>
          </Container>
        </ScrollArea>

        {/* Right Sidebar */}
        <Box w={sidebarOpen ? 280 : 80} style={{ borderLeft: '1px solid #eaeaea', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease' }} p="md">
          <Box style={{ flex: 1, overflowY: 'auto' }}>
            <Stack gap={0} align="stretch">
              {sidebarOpen && <Title order={5} fw={600} c="dimmed" mb="xs">Smart Actions</Title>}

              {!editMode ? (
                <>
                  <Tooltip label="Edit Questions" disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? "Edit Questions" : ""}
                      leftSection={<IconPencil size="1.2rem" stroke={1.5} />}
                      onClick={() => setEditMode(true)}
                    />
                  </Tooltip>

                  <Menu position="left-start" withArrow>
                    <Menu.Target>
                      <Tooltip label="Export" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Export" : ""}
                          leftSection={<IconDownload size="1.2rem" stroke={1.5} />}
                        />
                      </Tooltip>
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

                  {sidebarOpen && (
                    <Box mt="md">
                      <Divider my="sm" />
                      <Text fw={500} size="sm" mb="xs">View Mode</Text>
                      <SegmentedControl
                        orientation="vertical"
                        fullWidth
                        value={viewMode}
                        onChange={(v) => {
                          if (v === 'conversation') return;
                          setViewMode(v);
                          setShowExplanations({});
                          if (examActive && v !== 'exam') {
                             setExamActive(false);
                             clearInterval(timerRef.current);
                          }
                        }}
                        data={[
                          { label: <Group gap="xs" justify="flex-start" wrap="nowrap"><IconEyeOff size={16} stroke={1.5} /><Text size="sm">Hide Answers</Text></Group>, value: 'hide' },
                          { label: <Group gap="xs" justify="flex-start" wrap="nowrap"><IconEye size={16} stroke={1.5} /><Text size="sm">Show All Answers</Text></Group>, value: 'show' },
                          { label: <Group gap="xs" justify="flex-start" wrap="nowrap"><IconEdit size={16} stroke={1.5} /><Text size="sm">Interactive</Text></Group>, value: 'interactive' },
                          { label: <Group gap="xs" justify="flex-start" wrap="nowrap"><IconClock size={16} stroke={1.5} /><Text size="sm">Exam Mode</Text></Group>, value: 'exam' },
                          { label: <Group gap="xs" justify="flex-start" wrap="nowrap"><IconMessageDots size={16} stroke={1.5} /><Text size="sm" c="dimmed">Conversation</Text></Group>, value: 'conversation', disabled: true }
                        ]}
                      />
                    </Box>
                  )}

                  {sidebarOpen && viewMode === 'exam' && (
                    <Box mt="md">
                      <Divider my="sm" />
                      <Text fw={500} size="sm" mb="xs">Exam Settings</Text>
                      <NumberInput 
                        label="Time Limit (Minutes)" 
                        value={examTimerMinutes} 
                        onChange={setExamTimerMinutes} 
                        min={1} 
                        max={120} 
                        disabled={examActive}
                      />
                      {!examActive ? (
                        <Button fullWidth mt="md" color="indigo" onClick={handleStartExam}>
                          Start Exam
                        </Button>
                      ) : (
                        <Button fullWidth mt="md" color="red" variant="light" onClick={() => {
                          setExamActive(false);
                          clearInterval(timerRef.current);
                        }}>
                          Cancel Exam
                        </Button>
                      )}
                    </Box>
                  )}
                </>
              ) : (
                <>
                  {sidebarOpen && <Box mt="md" mb="xs" px="sm"><Text size="xs" fw={600} c="dimmed" tt="uppercase">Actions</Text></Box>}
                  <Tooltip label="Save Changes" disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? "Save Changes" : ""}
                      leftSection={<IconDeviceFloppy size="1.2rem" stroke={1.5} color="var(--mantine-color-blue-6)" />}
                      onClick={handleSaveEdits}
                    />
                  </Tooltip>
                  <Tooltip label="Cancel Edit" disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? "Cancel Edit" : ""}
                      leftSection={<IconX size="1.2rem" stroke={1.5} color="var(--mantine-color-red-6)" />}
                      onClick={() => setEditMode(false)}
                    />
                  </Tooltip>
                </>
              )}
            </Stack>
          </Box>
          <Box mt="auto" pt="sm">
            <Tooltip label={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"} position="left">
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setSidebarOpen(!sidebarOpen)}>
                {sidebarOpen ? <IconLayoutSidebarRightCollapse size={20} /> : <IconLayoutSidebarRightExpand size={20} />}
              </ActionIcon>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
