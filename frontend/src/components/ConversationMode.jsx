import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, Switch, Group, Text, Card, Center, ActionIcon, Badge, Stack, Divider, ScrollArea } from '@mantine/core';
import { IconMicrophone, IconMicrophoneOff, IconChevronLeft, IconChevronRight, IconMessage, IconHandClick, IconEye, IconEyeOff, IconShieldLock, IconShieldCheck, IconRefresh, IconUser, IconRobot } from '@tabler/icons-react';

function HtmlContent({ html, ...props }) {
  if (!html) return null;
  return (
    <Box className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: 1.65 }} {...props} />
  );
}

export default function ConversationMode({ exercise, question, convActive, currentConvIdx, totalQuestions, hasNext, hasPrev, onNext, onPrev, transcription, setTranscription, evaluation, setEvaluation }) {
  const [responseMode, setResponseMode] = useState('voice'); // 'voice' or 'text'
  const [micMode, setMicMode] = useState('push'); // 'push' or 'toggle'
  const [showLiveTranscription, setShowLiveTranscription] = useState(true);
  const [gradingMode, setGradingMode] = useState('lenient'); // 'lenient' or 'strict'
  
  const [isRecording, setIsRecording] = useState(false);
  const evaluationRef = useRef(evaluation);
  useEffect(() => {
    evaluationRef.current = evaluation;
  }, [evaluation]);

  const latestTranscriptionRef = useRef(transcription);
  useEffect(() => {
    latestTranscriptionRef.current = transcription;
  }, [transcription]);

  const [ws, setWs] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Ref to keep track of the current question audio so we can stop it if they navigate away
  const currentAudioRef = useRef(null);
  const isPushingRef = useRef(false);

  // Read question out when conversation mode is active
  useEffect(() => {
    if (convActive && question?.question_text) {
      // Strip HTML tags for clean reading
      const textToRead = question.question_text.replace(/<[^>]+>/g, '').trim();
      if (textToRead) {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
        }
        const audio = new Audio(`/api/voice/tts?text=${encodeURIComponent(textToRead)}`);
        currentAudioRef.current = audio;
        audio.play().catch(e => console.error("Auto-play prevented", e));
      }
    }
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, [convActive, question]);

  useEffect(() => {
    // Setup websocket
    if (!exercise || !question?.id) return;
    const wsUrl = `ws://localhost:8000/voice/stream/${exercise.id}/${question.id}`;
    const websocket = new WebSocket(wsUrl);
    
    websocket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'transcription') {
          setTranscription(data.text);
          latestTranscriptionRef.current = data.text;
        } else if (data.type === 'evaluation') {
          const newTurnUser = { role: 'user', text: latestTranscriptionRef.current || '' };
          const newTurnAi = { role: 'ai', text: data.message, status: data.status };
          const updatedConv = [...(evaluationRef.current?.conversation || []), newTurnUser, newTurnAi];
          setEvaluation({ ...evaluationRef.current, conversation: updatedConv, status: data.status, message: data.message });
          setTranscription('');
          latestTranscriptionRef.current = '';
        }
      } else if (event.data instanceof Blob) {
         // handle audio bytes
         const url = URL.createObjectURL(event.data);
         const audio = new Audio(url);
         if (currentAudioRef.current) {
           currentAudioRef.current.pause();
         }
         currentAudioRef.current = audio;
         audio.play();
      }
    };
    
    setWs(websocket);
    
    return () => {
      websocket.close();
    };
  }, [exercise, question?.id]);

  const startRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') return;
    
    // Stop any playing TTS audio immediately when the user starts speaking
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (micMode === 'push' && !isPushingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
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
          ws.send(JSON.stringify({ 
             action: "process", 
             response_mode: responseMode, 
             grading_mode: gradingMode, 
             history: evaluationRef.current?.conversation || []
          }));
        }
      };
      
      // stream data every 500ms
      mediaRecorder.start(500);
      setIsRecording(true);
      setTranscription('');
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Push to talk handlers
  useEffect(() => {
    if (micMode !== 'push') return;
    
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        isPushingRef.current = true;
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          startRecording();
        }
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        isPushingRef.current = false;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [micMode, ws, responseMode, gradingMode]);

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

  // hasPrev and hasNext are now provided via props

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

        <Group justify="space-between" mb="xl" align="flex-start">
          <Box fw={600} size="lg" style={{ flex: 1 }}>
            <Text component="span" fw={600} size="lg">{currentConvIdx + 1}. </Text>
            <HtmlContent html={question.question_text} style={{ display: 'inline' }} />
          </Box>
          <ActionIcon 
            variant="light" 
            color="red" 
            size="lg" 
            title="Reset Conversation"
            onClick={() => {
              setEvaluation(null);
              setTranscription('');
              latestTranscriptionRef.current = '';
            }}
          >
            <IconRefresh size={20} />
          </ActionIcon>
        </Group>

        <ScrollArea style={{ flex: 1, paddingRight: '12px' }} offsetScrollbars>
          {evaluation?.conversation && evaluation.conversation.map((turn, idx) => (
             <Box key={idx} mb="md">
               <Group gap="xs" mb={4}>
                 {turn.role === 'user' ? <IconUser size={14} style={{ color: 'var(--mantine-color-gray-6)' }} /> : <IconRobot size={14} style={{ color: 'var(--mantine-color-blue-6)' }} />}
                 <Text size="xs" c="dimmed" fw={500}>{turn.role === 'user' ? 'You' : 'AI'}</Text>
               </Group>
               <Card 
                 withBorder 
                 p="sm" 
                 radius="md"
                 style={{ 
                   backgroundColor: turn.role === 'user' ? '#f8f9fa' : (turn.status === 'Correct' ? '#e6ffee' : (turn.status === 'Chat' ? '#e6f7ff' : '#ffe6e6')),
                   marginLeft: turn.role === 'user' ? '24px' : '0',
                   marginRight: turn.role === 'user' ? '0' : '24px'
                 }}
               >
                 <Text size="sm">{turn.text}</Text>
               </Card>
             </Box>
          ))}

          {(isRecording || transcription) && (
            <Box mb="md">
               <Group gap="xs" mb={4}>
                 <IconUser size={14} style={{ color: 'var(--mantine-color-gray-6)' }} />
                 <Text size="xs" c="dimmed" fw={500}>You (Listening...)</Text>
               </Group>
               <Card withBorder p="sm" radius="md" style={{ backgroundColor: '#f8f9fa', marginLeft: '24px' }}>
                 <Text size="sm" c={!transcription ? "dimmed" : undefined}>{transcription || "..."}</Text>
               </Card>
            </Box>
          )}
        </ScrollArea>

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
          onMouseDown={micMode === 'push' ? () => { isPushingRef.current = true; startRecording(); } : null}
          onMouseUp={micMode === 'push' ? () => { isPushingRef.current = false; stopRecording(); } : null}
          onMouseLeave={micMode === 'push' ? () => { isPushingRef.current = false; stopRecording(); } : null}
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
          <Badge 
            component="button"
            variant="light" 
            color="orange"
            size="sm" 
            fw={600} 
            tt="none"
            leftSection={gradingMode === 'strict' ? <IconShieldLock size={14} /> : <IconShieldCheck size={14} />}
            style={{ cursor: 'pointer', transition: 'transform 0.1s', whiteSpace: 'normal', overflow: 'visible' }}
            onClick={() => setGradingMode(gradingMode === 'strict' ? 'lenient' : 'strict')}
          >
            {gradingMode === 'strict' ? 'Strict Grading' : 'Lenient Grading'}
          </Badge>
        </Group>
      </Box>
    </Stack>
  );
}
