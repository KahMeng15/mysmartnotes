import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, Switch, Group, Text, Card, Center, ActionIcon, Badge, Stack, Divider } from '@mantine/core';
import { IconMicrophone, IconMicrophoneOff, IconChevronLeft, IconChevronRight, IconMessage, IconHandClick, IconEye, IconEyeOff } from '@tabler/icons-react';

function HtmlContent({ html, ...props }) {
  if (!html) return null;
  return (
    <Box className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: 1.65 }} {...props} />
  );
}

export default function ConversationMode({ exercise, question, currentConvIdx, totalQuestions, onNext, onPrev, onCorrect }) {
  const [responseMode, setResponseMode] = useState('voice'); // 'voice' or 'text'
  const [micMode, setMicMode] = useState('push'); // 'push' or 'toggle'
  const [showLiveTranscription, setShowLiveTranscription] = useState(true);
  
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [ws, setWs] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Setup websocket
    if (!exercise || !question?.id) return;
    const wsUrl = `ws://localhost:8000/voice/stream/${exercise.id}/${question.id}`;
    const websocket = new WebSocket(wsUrl);
    
    websocket.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // Received TTS audio byte stream
        const url = URL.createObjectURL(event.data);
        const audio = new Audio(url);
        audio.play();
      } else {
        const data = JSON.parse(event.data);
        if (data.type === 'transcription') {
          setTranscription(data.text);
        } else if (data.type === 'evaluation') {
          setEvaluation({ status: data.status, message: data.message });
          if (data.status === 'Correct' && onCorrect) {
            setTimeout(() => {
              onCorrect();
            }, 3000); // Auto progress after 3 seconds
          }
        }
      }
    };
    
    setWs(websocket);
    
    return () => {
      websocket.close();
    };
  }, [exercise, question?.id]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          if (ws && ws.readyState === WebSocket.OPEN) {
             ws.send(event.data);
          }
        }
      };
      
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "process", response_mode: responseMode }));
        }
      };
      
      // stream data every 500ms
      mediaRecorder.start(500);
      setIsRecording(true);
      setTranscription('');
      setEvaluation(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Push to talk handlers
  useEffect(() => {
    if (micMode !== 'push') return;
    
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && !isRecording) {
        e.preventDefault();
        startRecording();
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space' && isRecording) {
        e.preventDefault();
        stopRecording();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [micMode, isRecording]);

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // Ensure microphone is released when component unmounts
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);

  const hasPrev = currentConvIdx > 0;
  const hasNext = currentConvIdx < totalQuestions - 1;

  return (
    <Stack spacing={0} style={{ height: 'calc(100vh - 240px)', overflow: 'hidden' }}>
      <Divider mb="md" />
      {/* First Div: Question Context & Conversation Log */}
      <Box py="md" px={0} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <Box mb="xs">
          <Group gap={8} wrap="nowrap">
            {question.difficulty && (
              <Text size="xs" c="dimmed" fw={500}>
                {question.difficulty}
              </Text>
            )}
            {question.difficulty && (question.topic || question.reference_resource_title) && (
              <Text size="xs" c="dimmed" fw={500}>|</Text>
            )}
            {question.topic && (
              <Text size="xs" c="dimmed" fw={500}>
                {question.topic}
              </Text>
            )}
            {question.topic && question.reference_resource_title && (
              <Text size="xs" c="dimmed" fw={500}>|</Text>
            )}
            {question.reference_resource_title && (
              <Text 
                size="xs" 
                c="dimmed" 
                fw={500}
                style={question.reference_resource_id ? { cursor: 'pointer', transition: 'color 0.2s' } : {}} 
                onMouseEnter={(e) => { if (question.reference_resource_id) e.currentTarget.style.color = 'var(--mantine-color-blue-6)'; }}
                onMouseLeave={(e) => { if (question.reference_resource_id) e.currentTarget.style.color = 'var(--mantine-color-dimmed)'; }}
                onClick={() => {
                  if (question.reference_resource_id) {
                    let url = `/resource/${question.reference_resource_id}`;
                    if (question.reference_chunk_position !== undefined && question.reference_chunk_position !== null) {
                      url += `?ref=${question.reference_chunk_position}`;
                    } else if (question.reference_quote) {
                      url += `?highlight=${encodeURIComponent(question.reference_quote)}`;
                    }
                    window.open(url, '_blank');
                  }
                }}
              >
                {question.reference_resource_title}
              </Text>
            )}
          </Group>
        </Box>

        <Box fw={600} size="lg" mb="xl">
          <Text component="span" fw={600} size="lg">{currentConvIdx + 1}. </Text>
          <HtmlContent html={question.question_text} style={{ display: 'inline' }} />
        </Box>

        {showLiveTranscription && (
          <Box mb="md">
            <Text weight={500} size="sm" c="dimmed" mb="xs">Transcription</Text>
            <Card withBorder p="sm" style={{ minHeight: '60px', backgroundColor: '#f8f9fa' }}>
              <Text c={!transcription ? "dimmed" : undefined}>
                {transcription || (isRecording ? "Listening..." : "Ready (Press microphone to talk)")}
              </Text>
            </Card>
          </Box>
        )}

        {evaluation && (
          <Box mb="md">
            <Text weight={500} size="sm" c="dimmed" mb="xs">AI Feedback</Text>
            <Card withBorder p="sm" style={{ backgroundColor: evaluation.status === 'Correct' ? '#e6ffee' : '#ffe6e6' }}>
              <Text>{evaluation.message}</Text>
            </Card>
          </Box>
        )}

        {/* Navigation / Counter at the very bottom of the first div */}
        <Group justify="space-between" mt="auto" pt="xl">
          <ActionIcon variant="light" size="lg" onClick={onPrev} disabled={!hasPrev}>
            <IconChevronLeft size={24} />
          </ActionIcon>
          <Text size="sm" c="dimmed">{currentConvIdx + 1} / {totalQuestions}</Text>
          <ActionIcon variant="light" size="lg" onClick={onNext} disabled={!hasNext}>
            <IconChevronRight size={24} />
          </ActionIcon>
        </Group>
      </Box>

      {/* Second Div: Controls */}
      <Box 
        pt="md"
        pb={0}
        px={0}
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          backgroundColor: 'var(--mantine-color-body, #fff)',
          borderTop: '1px solid var(--mantine-color-gray-2)',
          zIndex: 10,
          marginTop: 'auto'
        }}
      >
        <Button 
          size="xl" 
          color={isRecording ? "red" : "blue"}
          radius="xl"
          mb="xl"
          leftSection={isRecording ? <IconMicrophone size={24} /> : <IconMicrophoneOff size={24} />}
          onMouseDown={micMode === 'push' ? startRecording : null}
          onMouseUp={micMode === 'push' ? stopRecording : null}
          onClick={micMode === 'toggle' ? toggleRecording : null}
          style={{ transition: 'background-color 0.2s' }}
        >
          {micMode === 'push' ? (isRecording ? "Recording..." : "Hold to Talk") : (isRecording ? "Tap to Stop" : "Tap to Talk")}
        </Button>

        <Group gap="xs" justify="center">
          <Badge 
            component="button"
            variant="light" 
            size="sm" 
            fw={600} 
            tt="none"
            leftSection={<IconMessage size={14} />}
            style={{ cursor: 'pointer', transition: 'transform 0.1s', whiteSpace: 'normal', overflow: 'visible' }}
            onClick={() => setResponseMode(responseMode === 'voice' ? 'text' : 'voice')}
          >
            {responseMode === 'voice' ? 'Voice Mode' : 'Text Mode'}
          </Badge>
          <Badge 
            component="button"
            variant="light" 
            color="grape"
            size="sm" 
            fw={600} 
            tt="none"
            leftSection={<IconHandClick size={14} />}
            style={{ cursor: 'pointer', transition: 'transform 0.1s', whiteSpace: 'normal', overflow: 'visible' }}
            onClick={() => setMicMode(micMode === 'push' ? 'toggle' : 'push')}
          >
            {micMode === 'push' ? 'Push-to-Talk' : 'Toggle Mic'}
          </Badge>
          <Badge 
            component="button"
            variant="light" 
            color="teal"
            size="sm" 
            fw={600} 
            tt="none"
            leftSection={showLiveTranscription ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            style={{ cursor: 'pointer', transition: 'transform 0.1s', whiteSpace: 'normal', overflow: 'visible' }}
            onClick={() => setShowLiveTranscription(!showLiveTranscription)}
          >
            Transcription {showLiveTranscription ? 'On' : 'Off'}
          </Badge>
        </Group>
      </Box>
    </Stack>
  );
}
