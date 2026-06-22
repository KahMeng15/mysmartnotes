import re

with open("scratch_summary.jsx", "r") as f:
    content = f.read()

# 1. Update useParams
content = re.sub(
    r'const { noteId, summaryId } = useParams\(\);',
    r'const { summaryId } = useParams();',
    content
)

# 2. Update useEffect to fetch summary then note
old_use_effect = r"""  useEffect\(\) => {
    if \(!noteId\) {
      navigate\('/dashboard'\);
      return;
    }
    
    const loadNote = async \(\) => {
      try {
        const data = await fetchApi\(`/notes/\$\{noteId\}\?t=\$\{Date\.now\(\)\}`\);
        setNote\(data\);
      } catch \(err\) {
        console\.error\("Failed to load note", err\);
      }
    };
    loadNote\(\);
    Promise\.all\(\[
      fetchApi\(`/summaries\?note_id=\$\{noteId\}`\),
      fetchApi\('/search/tasks/active'\)\.catch\(\(\) => null\)
    \]\)\.then\(\(\[summariesData, activeData\]\) => {
      let activeTask = null;
      let genId = null;

      if \(activeData && activeData\.tasks\) {
        activeTask = activeData\.tasks\.find\(t => {
          const data = t\.input_data\?\.kwargs \|\| t\.input_data \|\| \{\};
          return t\.task_type === 'summary_generation' && String\(data\.note_id\) === String\(noteId\) && \['pending', 'processing', 'running'\]\.includes\(t\.status\);
        }\);
        
        if \(activeTask\) {
          const data = activeTask\.input_data\?\.kwargs \|\| activeTask\.input_data \|\| \{\};
          genId = data\.summary_id \|\| 'generating';
          setCurrentTaskId\(activeTask\.task_id\);
          setGenerating\(true\);
          setGeneratingSummaryId\(genId\);
          setTaskStatus\(activeTask\);
        }
      }

      loadSummaries\(false, false, summariesData, activeTask, genId\);
    }\)\.catch\(err => {
      console\.error\("Failed to load initial data", err\);
      setLoading\(false\);
    }\);
  }, \[noteId\]\);"""

new_use_effect = """  useEffect(() => {
    if (!summaryId) {
      navigate('/dashboard');
      return;
    }
    
    const init = async () => {
      try {
        setLoading(true);
        const summaryData = await fetchApi(`/summaries/${summaryId}`);
        setSelectedSummary(summaryData);
        setSummaryContent(summaryData.content);
        
        const noteData = await fetchApi(`/notes/${summaryData.note_id}`);
        setNote(noteData);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load data", err);
        setError("Failed to load summary");
        setLoading(false);
      }
    };
    init();
  }, [summaryId]);"""

# Replace old loadNote + Promise.all with the new one. Since regex matching the whole big block might fail, I'll use simple string replace
content = re.sub(r'  useEffect\(\(\) => \{\n    if \(!noteId\).*?}, \[noteId\]\);', new_use_effect, content, flags=re.DOTALL)

# 3. Strip out the rest of the unnecessary useEffects/functions (loadSummaries, loadSummaryContent, etc.)
content = re.sub(r'  const loadSummaries = async \(.*?\};', '', content, flags=re.DOTALL)
content = re.sub(r'  const loadSummaryContent = async \(.*?\};', '', content, flags=re.DOTALL)
content = re.sub(r'  const checkTaskStatus = async \(.*?\};', '', content, flags=re.DOTALL)
content = re.sub(r'  useEffect\(\(\) => \{\n    let interval;\n    if \(generating.*?}, \[generating, currentTaskId\]\);', '', content, flags=re.DOTALL)
content = re.sub(r'  const startGenerateSummary = async \(.*?\};', '', content, flags=re.DOTALL)

# 4. Remove unnecessary UI elements from Sidebar
content = re.sub(r'<Tooltip label="Generate".*?</Tooltip>', '', content, flags=re.DOTALL)
content = re.sub(r'<Tooltip label="Back to note".*?</Tooltip>', '', content, flags=re.DOTALL)

# Remove the Versions section and the summaries.map(...)
content = re.sub(r'\{\!isEditing && \(\n                <>\n                  \{sidebarOpen && <Title order=\{5\} fw=\{600\} c="dimmed" mt="xl" mb="md">Versions</Title>\}.*?\{/\* Modals \*/\}', '{/* Modals */}', content, flags=re.DOTALL)

# 5. Fix breadcrumbs top bar
breadcrumb_replacement = """          <Group>
            {note?.subject && (
              <Group gap="xs" ml="xs">
                {note.subject.group && (
                  <>
                    <Text size="sm" fw={500} c="dimmed" className="clickable-crumb" onClick={() => navigate(`/group/${note.subject.group.id}`)}>{note.subject.group.name}</Text>
                    <Text size="sm" c="dimmed">/</Text>
                  </>
                )}
                <Text size="sm" fw={500} c="dimmed" className="clickable-crumb" onClick={() => navigate(`/subject/${note.subject.id}`)}>{note.subject.name}</Text>
              </Group>
            )}
          </Group>"""
content = re.sub(r'<Group>\s*<ActionIcon variant="subtle".*?{note\?.subject && \(.*?</Group>\s*</Group>\s*</Group>', breadcrumb_replacement + '\n        </Group>', content, flags=re.DOTALL)

# 6. Change noteId check for render to note check
content = re.sub(r'if \(!noteId\) return null;', r'if (!summaryId) return null;', content)

with open("scratch_summary_patched.jsx", "w") as f:
    f.write(content)
