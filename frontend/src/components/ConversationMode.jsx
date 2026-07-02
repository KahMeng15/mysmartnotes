import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, Switch, Group, Text, Card, Center, Loader, ActionIcon } from '@mantine/core';
import { IconMicrophone, IconMicrophoneOff, IconVolume, IconMessage } from '@tabler/icons-react';

export default function ConversationMode({ exercise, questionId }) {
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
    if (!exercise || !questionId) return;
    const wsUrl = `ws://localhost:8000/voice/stream/${exercise.id}/${questionId}`;
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
        }
      }
    };
    
    setWs(websocket);
    
    return () => {
      websocket.close();
    };
  }, [exercise, questionId]);

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

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group position="apart" mb="md">
        <Text weight={500}>Voice Verify Module</Text>
        <Group>
          <Switch 
            label="Response Mode (Voice/Text)" 
            checked={responseMode === 'voice'} 
            onChange={(e) => setResponseMode(e.currentTarget.checked ? 'voice' : 'text')} 
          />
          <Switch 
            label="Push-to-Talk / Toggle" 
            checked={micMode === 'push'} 
            onChange={(e) => setMicMode(e.currentTarget.checked ? 'push' : 'toggle')} 
          />
          <Switch 
            label="Show Live Transcription" 
            checked={showLiveTranscription} 
            onChange={(e) => setShowLiveTranscription(e.currentTarget.checked)} 
          />
        </Group>
      </Group>

      <Center mb="lg">
        <Button 
          size="xl" 
          color={isRecording ? "red" : "blue"}
          radius="xl"
          onMouseDown={micMode === 'push' ? startRecording : null}
          onMouseUp={micMode === 'push' ? stopRecording : null}
          onClick={micMode === 'toggle' ? toggleRecording : null}
        >
          {isRecording ? <IconMicrophone size={32} /> : <IconMicrophoneOff size={32} />}
          {micMode === 'push' ? (isRecording ? " Recording..." : " Hold Spacebar or Click to Talk") : (isRecording ? " Click to Stop" : " Click to Talk")}
        </Button>
      </Center>

      {showLiveTranscription && (
        <Box mb="md">
          <Text weight={500} size="sm" color="dimmed">Transcription</Text>
          <Card withBorder p="sm" style={{ minHeight: '60px' }}>
            <Text>{transcription || "..."}</Text>
          </Card>
        </Box>
      )}

      {evaluation && (
        <Box>
          <Text weight={500} size="sm" color="dimmed">AI Evaluation ({evaluation.status})</Text>
          <Card withBorder p="sm" style={{ backgroundColor: evaluation.status === 'Correct' ? '#e6ffee' : '#ffe6e6' }}>
            <Text>{evaluation.message}</Text>
          </Card>
        </Box>
      )}
    </Card>
  );
}
