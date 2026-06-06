import { useState, useEffect } from 'react';
import { Box, Title, Text, FileInput, Select, Button, Stack, Paper, Group, Checkbox, Progress } from '@mantine/core';
import { IconUpload, IconFile } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function UploadDocs() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [files, setFiles] = useState([]);
  const [autoGenerate, setAutoGenerate] = useState(true);
  
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

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

  const handleUpload = async () => {
    if (!selectedSubject || files.length === 0) {
      setError("Please select a subject and at least one file.");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(20); // Fake progress to show activity

    try {
      const formData = new FormData();
      formData.append('subject_id', selectedSubject);
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('auto_extract', autoGenerate);

      await fetchApi('/lectures/upload', {
        method: 'POST',
        body: formData,
      });

      setProgress(100);
      setTimeout(() => {
        navigate(`/notes`);
      }, 800);

    } catch (err) {
      setError(err.message || 'Failed to upload document');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box maxWidth={600}>
      <Title order={2} mb="md">Upload Documents</Title>
      <Text c="dimmed" mb="xl">Upload PDFs, PPTXs, or Images to generate smart notes.</Text>

      <Paper withBorder p="xl" radius="md">
        <Stack>
          {error && <Text color="red" size="sm">{error}</Text>}
          
          <Select
            label="Select Subject"
            placeholder="Choose a subject for this document"
            data={subjects.map(s => ({ value: s.id.toString(), label: s.name }))}
            value={selectedSubject}
            onChange={setSelectedSubject}
            searchable
            required
          />

          <FileInput
            label="Select Files"
            placeholder="Click to choose files"
            multiple
            leftSection={<IconFile size={16} />}
            accept="application/pdf,image/*,.pptx"
            size="md"
            value={files}
            onChange={setFiles}
            required
          />

          <Checkbox
            label="Generate AI Summary automatically after processing"
            checked={autoGenerate}
            onChange={(e) => setAutoGenerate(e.currentTarget.checked)}
          />

          {uploading && (
            <Box mt="sm">
              <Text size="sm" mb={5}>Uploading...</Text>
              <Progress value={progress} animated striped color="blue" />
            </Box>
          )}

          <Group justify="flex-end" mt="md">
            <Button 
              leftSection={<IconUpload size={16} />} 
              onClick={handleUpload}
              loading={uploading}
              disabled={!selectedSubject || files.length === 0}
            >
              Upload and Process
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Box>
  );
}
