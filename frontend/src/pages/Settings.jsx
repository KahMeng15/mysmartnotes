import { Box, Title, Paper, Switch, Stack, TextInput, Button, Divider, Text } from '@mantine/core';

export default function Settings() {
  return (
    <Box maxWidth={600}>
      <Title order={2} mb="xl">Account Settings</Title>
      
      <Paper withBorder p="xl" radius="md" mb="xl">
        <Title order={4} mb="md">Profile</Title>
        <Stack>
          <TextInput label="Full Name" defaultValue="Student Name" />
          <TextInput label="Email" defaultValue="student@university.edu" disabled />
          <Button w="fit-content">Update Profile</Button>
        </Stack>
      </Paper>

      <Paper withBorder p="xl" radius="md">
        <Title order={4} mb="md">Preferences</Title>
        <Stack>
          <Switch label="Email Notifications" description="Receive updates about processing completion" defaultChecked />
          <Divider my="sm" />
          <Switch label="Dark Mode" description="Toggle dark mode theme across the app" />
          <Divider my="sm" />
          <Box>
            <Text fw={500} size="sm">Export Format</Text>
            <Text c="dimmed" size="xs" mb="sm">Default format when exporting notes</Text>
            <TextInput defaultValue="Markdown" readOnly />
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
