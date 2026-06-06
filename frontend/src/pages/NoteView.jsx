import { Box, Title, Tabs, Paper, Textarea, Group, Button, Badge } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';

export default function NoteView() {
  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={2}>Calculus Lecture 1</Title>
          <Badge mt="xs">Calculus I</Badge>
        </Box>
        <Button leftSection={<IconDeviceFloppy size={16} />}>Save Changes</Button>
      </Group>

      <Tabs defaultValue="content">
        <Tabs.List mb="md">
          <Tabs.Tab value="content">Raw Content</Tabs.Tab>
          <Tabs.Tab value="summary">AI Summary</Tabs.Tab>
          <Tabs.Tab value="flashcards">Flashcards</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="content">
          <Paper withBorder p="md" radius="md">
            <Textarea 
              minRows={20} 
              autosize 
              defaultValue="# Calculus Introduction\n\nToday we learned about limits..." 
              variant="unstyled"
            />
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="summary">
          <Paper withBorder p="md" radius="md" bg="gray.0">
            <Title order={4} mb="md">Key Takeaways</Title>
            <ul>
              <li>A limit is the value that a function approaches as the input approaches some value.</li>
              <li>Derivatives represent the rate of change.</li>
            </ul>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
