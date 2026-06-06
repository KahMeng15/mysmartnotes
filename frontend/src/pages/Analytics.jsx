import { Box, Title, SimpleGrid, Paper, Text, RingProgress, Group, Center } from '@mantine/core';

export default function Analytics() {
  return (
    <Box>
      <Title order={2} mb="xl">Learning Analytics</Title>
      
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder p="xl" radius="md">
          <Title order={4} mb="xl">Study Consistency</Title>
          <Center>
            <RingProgress
              size={200}
              thickness={20}
              sections={[{ value: 75, color: 'blue' }]}
              label={<Text ta="center" size="xl" fw={700}>75%</Text>}
            />
          </Center>
          <Text ta="center" mt="md" c="dimmed">You have met your daily goal 5 out of 7 days this week.</Text>
        </Paper>

        <Paper withBorder p="xl" radius="md">
          <Title order={4} mb="xl">Quiz Performance</Title>
          <Center>
            <RingProgress
              size={200}
              thickness={20}
              sections={[
                { value: 40, color: 'teal', tooltip: 'Correct' },
                { value: 15, color: 'red', tooltip: 'Incorrect' },
              ]}
              label={<Text ta="center" size="xl" fw={700}>B+</Text>}
            />
          </Center>
          <Text ta="center" mt="md" c="dimmed">Average score across all subjects</Text>
        </Paper>
      </SimpleGrid>
    </Box>
  );
}
