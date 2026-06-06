import { useState, useEffect } from 'react';
import { Box, Title, Tabs, Paper, Select, NumberInput, Button, Radio, Stack, Text, Group, Progress, Loader, Center } from '@mantine/core';
import { fetchApi } from '../lib/api';

export default function QuizSystem() {
  const [activeTab, setActiveTab] = useState('configure');
  const [subjects, setSubjects] = useState([]);
  
  // Configure Quiz State
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState('Medium');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Take Quiz State
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const data = await fetchApi('/subjects');
        setSubjects(data || []);
      } catch (err) {
        console.error("Failed to load subjects", err);
      }
    };
    loadSubjects();
  }, []);

  const handleGenerateQuiz = async () => {
    if (!selectedSubject) {
      setError("Please select a subject to test.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      // Find all lectures under this subject to use as source
      const lectures = await fetchApi('/lectures');
      const subjectLectures = lectures.filter(l => l.subject_id == selectedSubject);
      
      if (subjectLectures.length === 0) {
        throw new Error("No notes found in this subject to generate a quiz from.");
      }

      // We'll just use the subject as the source
      const response = await fetchApi('/quizzes/generate', {
        method: 'POST',
        body: JSON.stringify({
          source_type: 'subject',
          source_ids: [selectedSubject],
          count: numQuestions,
          difficulty: difficulty.toLowerCase()
        })
      });

      if (response && response.questions) {
        setCurrentQuiz(response);
        setCurrentQuestionIndex(0);
        setSelectedAnswers({});
        setActiveTab('take');
      } else {
        throw new Error("Failed to generate questions. Not enough content?");
      }

    } catch (err) {
      setError(err.message || 'Error generating quiz');
    } finally {
      setGenerating(false);
    }
  };

  const handleAnswerSelect = (value) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: value
    }));
  };

  const activeQuestion = currentQuiz?.questions[currentQuestionIndex];

  return (
    <Box maxWidth={800} mx="auto">
      <Title order={2} mb="md">Quiz Engine</Title>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="configure">Configure Quiz</Tabs.Tab>
          <Tabs.Tab value="take" disabled={!currentQuiz}>Take Quiz</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="configure">
          <Paper withBorder p="xl" radius="md">
            <Stack>
              {error && <Text color="red" size="sm">{error}</Text>}
              <Select 
                label="Subject to Test" 
                data={subjects.map(s => ({ value: s.id.toString(), label: s.name }))} 
                placeholder="Select subject" 
                value={selectedSubject}
                onChange={setSelectedSubject}
                searchable
                required
              />
              <NumberInput 
                label="Number of Questions" 
                value={numQuestions} 
                onChange={setNumQuestions} 
                min={1} 
                max={20} 
              />
              <Select 
                label="Difficulty" 
                data={['Easy', 'Medium', 'Hard']} 
                value={difficulty}
                onChange={setDifficulty}
              />
              <Button mt="md" onClick={handleGenerateQuiz} loading={generating}>
                Generate & Start Quiz
              </Button>
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="take">
          {currentQuiz ? (
            <Paper withBorder p="xl" radius="md">
              <Group justify="space-between" mb="md">
                <Text fw={600}>Question {currentQuestionIndex + 1} of {currentQuiz.questions.length}</Text>
              </Group>
              <Progress value={((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100} mb="xl" color="blue" />
              
              <Title order={4} mb="lg">{activeQuestion?.question_text}</Title>
              
              {activeQuestion?.options && (
                <Radio.Group 
                  name={`q${currentQuestionIndex}`} 
                  orientation="vertical" 
                  spacing="md"
                  value={selectedAnswers[currentQuestionIndex] || ''}
                  onChange={handleAnswerSelect}
                >
                  {activeQuestion.options.map((opt, idx) => (
                    <Radio key={idx} value={opt} label={opt} />
                  ))}
                </Radio.Group>
              )}
              
              <Group justify="space-between" mt="xl">
                <Button 
                  variant="default" 
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                >
                  Previous
                </Button>
                
                {currentQuestionIndex < currentQuiz.questions.length - 1 ? (
                  <Button onClick={() => setCurrentQuestionIndex(prev => prev + 1)}>
                    Next Question
                  </Button>
                ) : (
                  <Button color="green">
                    Submit Quiz
                  </Button>
                )}
              </Group>
            </Paper>
          ) : (
            <Center h={200}>
              <Text c="dimmed">Configure and generate a quiz first!</Text>
            </Center>
          )}
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
