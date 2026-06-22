import re
import os

filepath = "/Users/kahmeng/Documents/GitHub/mysmartnotes/frontend/src/pages/SummaryView.jsx"
with open(filepath, 'r') as f:
    lines = f.readlines()

def patch_lines():
    new_lines = []
    skip = False
    
    for i, line in enumerate(lines):
        # 1. State changes
        if "const { noteId, summaryId } = useParams();" in line:
            new_lines.append("  const { summaryId } = useParams();\n")
            continue
        if "const [summaries, setSummaries] = useState([]);" in line:
            continue
        if "const [generating, setGenerating] = useState(false);" in line:
            continue
        if "const [generatingSummaryId, setGeneratingSummaryId] = useState(null);" in line:
            continue
        if "const [currentTaskId, setCurrentTaskId] = useState(null);" in line:
            continue
        if "const [taskStatus, setTaskStatus] = useState(null);" in line:
            continue
            
        # 2. Effects and functions to remove entirely
        if "useEffect(() => {" in line and "if (!noteId) {" in lines[i+1]:
            skip = True
        
        if "useEffect(() => {" in line and "let interval;" in lines[i+1]:
            skip = True
            
        if "const checkTaskStatus = async () => {" in line:
            skip = True
            
        if "const loadSummaries = async (" in line:
            skip = True
            
        if "const loadSummaryContent = async (" in line:
            skip = True
            
        if "const startGenerateSummary = async () => {" in line:
            skip = True

        if skip:
            # Check for end of function block
            if line.startswith("  };") or line.startswith("  }, [noteId]);") or line.startswith("  }, [generating, currentTaskId]);"):
                skip = False
            continue
            
        # Replace the `if (!noteId)` near the bottom of file
        if "if (!noteId) return null;" in line:
            new_lines.append("  if (!summaryId) return null;\n")
            continue
            
        # Breadcrumbs replacement
        if "onClick={() => navigate(`/note/${noteId}`)}>{note.title || 'Note'}</Text>" in line:
            continue # Remove this line
        if "<Text size=\"sm\" c=\"dimmed\">/</Text>" in line and "onClick={() => navigate(`/note/${noteId}`)}" in lines[i-1]:
            continue # Remove this line
        if "<Text size=\"sm\" fw={500} c=\"dimmed\">Summary</Text>" in line:
            continue # Remove this line
            
        # Remove generating buttons from UI
        if "isFailed =" in line or "processingProgress =" in line:
            continue
            
        # Remove the modal
        if "<Modal opened={modalOpened} onClose={() => setModalOpened(false)} title=\"Summary Parameters\" centered>" in line:
            skip = True
            continue
            
        if skip and line.startswith("      </Modal>"):
            skip = False
            continue
            
        new_lines.append(line)
        
    return new_lines

def remove_generating_ui(content):
    # Remove the big generating block and the summaries.length === 0 block
    start_str = "            {generating && summaryId === generatingSummaryId ? ("
    end_str = "            ) : ("
    
    if start_str in content and end_str in content:
        start_idx = content.find(start_str)
        end_idx = content.find(end_str, start_idx) + len(end_str)
        
        # Replace that whole block with just: 
        # { loading ? ( ... ) : error ? ( ... ) : (
        content = content[:start_idx] + """            {loading ? (
              <Center h="50vh"><Loader size="lg" /></Center>
            ) : error ? (
              <Center h="50vh">
                <Stack align="center">
                  <IconAlertCircle size={48} color="red" />
                  <Text c="red">{error}</Text>
                </Stack>
              </Center>
            ) : (""" + content[end_idx:]
    return content

def remove_versions_sidebar(content):
    # Remove the versions section
    start_str = "              {!isEditing && ("
    
    start_idx = content.find(start_str)
    
    if start_idx != -1:
        # Search for the closing tag `              )}` after the versions
        end_idx = content.find("            </Stack>", start_idx)
        if end_idx != -1:
            content = content[:start_idx] + content[end_idx:]
    return content

def remove_generate_button(content):
    start_str = """                  <Tooltip label="Generate" disabled={sidebarOpen} position="left">"""
    end_str = """                  </Tooltip>"""
    
    idx = content.find(start_str)
    if idx != -1:
        end_idx = content.find(end_str, idx) + len(end_str)
        content = content[:idx] + content[end_idx:]
    return content
    
def remove_back_to_note_button(content):
    start_str = """                    <Tooltip label="Back to note" disabled={sidebarOpen} position="left">"""
    end_str = """                    </Tooltip>"""
    
    idx = content.find(start_str)
    if idx != -1:
        end_idx = content.find(end_str, idx) + len(end_str)
        content = content[:idx] + content[end_idx:]
    return content

new_lines = patch_lines()
content = "".join(new_lines)

# Inject the new Initialization useEffect
init_effect = """
  useEffect(() => {
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
  }, [summaryId]);
"""
content = content.replace("  const toggleSidebar = async () => {\\n", init_effect + "\\n  const toggleSidebar = async () => {\\n")


content = remove_generating_ui(content)
content = remove_versions_sidebar(content)
content = remove_generate_button(content)
content = remove_back_to_note_button(content)

with open(filepath, 'w') as f:
    f.write(content)
print("Patch successfully applied!")
