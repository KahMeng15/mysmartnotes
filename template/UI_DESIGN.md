# 🎨 UI Design & Component Library

Complete UI/UX reference for MySmartNotes frontend implementation using Streamlit.

## Table of Contents

1. [Design System](#design-system)
2. [Layout Structure](#layout-structure)
3. [Navigation](#navigation)
4. [Components](#components)
5. [Page Templates](#page-templates)
6. [Responsive Design](#responsive-design)
7. [Accessibility](#accessibility)

---

## Design System

### Color Palette

```python
# config/theme.py
COLORS = {
    # Primary colors
    "primary": "#4ECDC4",      # Turquoise - main brand color
    "primary_dark": "#3AB8B0",
    "primary_light": "#7EDCD6",
    
    # Secondary colors
    "secondary": "#FF6B6B",    # Coral - accents and warnings
    "secondary_dark": "#E85555",
    "secondary_light": "#FF8585",
    
    # Neutral colors
    "dark": "#2C3E50",         # Dark blue-gray - text
    "gray": "#7F8C8D",         # Medium gray - secondary text
    "light_gray": "#BDC3C7",   # Light gray - borders
    "background": "#F8F9FA",   # Off-white - page background
    "white": "#FFFFFF",
    
    # Status colors
    "success": "#2ECC71",      # Green
    "warning": "#F39C12",      # Orange
    "error": "#E74C3C",        # Red
    "info": "#3498DB",         # Blue
    
    # Subject colors (for categorization)
    "subject_1": "#9B59B6",    # Purple
    "subject_2": "#1ABC9C",    # Teal
    "subject_3": "#F1C40F",    # Yellow
    "subject_4": "#E67E22",    # Orange
    "subject_5": "#3498DB",    # Blue
}

# Typography
FONTS = {
    "primary": "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "heading": "Poppins, sans-serif",
    "monospace": "JetBrains Mono, Consolas, Monaco, monospace"
}

FONT_SIZES = {
    "xs": "0.75rem",    # 12px
    "sm": "0.875rem",   # 14px
    "base": "1rem",     # 16px
    "lg": "1.125rem",   # 18px
    "xl": "1.25rem",    # 20px
    "2xl": "1.5rem",    # 24px
    "3xl": "1.875rem",  # 30px
    "4xl": "2.25rem",   # 36px
}

# Spacing
SPACING = {
    "xs": "0.25rem",   # 4px
    "sm": "0.5rem",    # 8px
    "md": "1rem",      # 16px
    "lg": "1.5rem",    # 24px
    "xl": "2rem",      # 32px
    "2xl": "3rem",     # 48px
}

# Border radius
RADIUS = {
    "sm": "0.25rem",   # 4px
    "md": "0.5rem",    # 8px
    "lg": "0.75rem",   # 12px
    "xl": "1rem",      # 16px
    "full": "9999px",  # Fully rounded
}

# Shadows
SHADOWS = {
    "sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    "md": "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    "lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    "xl": "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
}
```

### Streamlit Theme Configuration

```toml
# .streamlit/config.toml
[theme]
primaryColor = "#4ECDC4"
backgroundColor = "#F8F9FA"
secondaryBackgroundColor = "#FFFFFF"
textColor = "#2C3E50"
font = "sans serif"

[server]
headless = true
port = 8501

[browser]
gatherUsageStats = false
```

### Custom CSS

```python
# services/frontend/styles/custom.css
def load_custom_css():
    """Load custom CSS styling."""
    st.markdown("""
        <style>
        /* Import fonts */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@600;700&display=swap');
        
        /* Global styles */
        html, body, [class*="css"] {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            color: #2C3E50;
        }
        
        /* Hide Streamlit branding */
        #MainMenu {visibility: hidden;}
        footer {visibility: hidden;}
        
        /* Sidebar styling */
        [data-testid="stSidebar"] {
            background: linear-gradient(180deg, #4ECDC4 0%, #3AB8B0 100%);
            padding: 2rem 1rem;
        }
        
        [data-testid="stSidebar"] h1, 
        [data-testid="stSidebar"] h2,
        [data-testid="stSidebar"] h3,
        [data-testid="stSidebar"] .css-text {
            color: white !important;
        }
        
        /* Card styling */
        .card {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            margin-bottom: 1rem;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        
        .card-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: #2C3E50;
            margin-bottom: 0.5rem;
        }
        
        .card-subtitle {
            font-size: 0.875rem;
            color: #7F8C8D;
            margin-bottom: 1rem;
        }
        
        /* Button styling */
        .stButton > button {
            background: linear-gradient(135deg, #4ECDC4 0%, #3AB8B0 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 0.75rem 1.5rem;
            font-weight: 500;
            transition: all 0.2s;
            box-shadow: 0 2px 4px rgba(78, 205, 196, 0.2);
        }
        
        .stButton > button:hover {
            background: linear-gradient(135deg, #3AB8B0 0%, #2EA39C 100%);
            box-shadow: 0 4px 8px rgba(78, 205, 196, 0.3);
            transform: translateY(-1px);
        }
        
        .stButton > button:active {
            transform: translateY(0);
        }
        
        /* Secondary button */
        .secondary-button {
            background: white !important;
            color: #4ECDC4 !important;
            border: 2px solid #4ECDC4 !important;
        }
        
        .secondary-button:hover {
            background: #F0FFFE !important;
        }
        
        /* Input fields */
        .stTextInput > div > div > input,
        .stTextArea > div > div > textarea {
            border-radius: 8px;
            border: 2px solid #E8E8E8;
            padding: 0.75rem;
            transition: border-color 0.2s;
        }
        
        .stTextInput > div > div > input:focus,
        .stTextArea > div > div > textarea:focus {
            border-color: #4ECDC4;
            box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.1);
        }
        
        /* File uploader */
        [data-testid="stFileUploader"] {
            background: white;
            border: 2px dashed #4ECDC4;
            border-radius: 12px;
            padding: 2rem;
            text-align: center;
            transition: all 0.2s;
        }
        
        [data-testid="stFileUploader"]:hover {
            border-color: #3AB8B0;
            background: #F0FFFE;
        }
        
        /* Progress bar */
        .stProgress > div > div > div > div {
            background: linear-gradient(90deg, #4ECDC4 0%, #7EDCD6 100%);
        }
        
        /* Tabs */
        .stTabs [data-baseweb="tab-list"] {
            gap: 1rem;
            border-bottom: 2px solid #E8E8E8;
        }
        
        .stTabs [data-baseweb="tab"] {
            padding: 0.75rem 1.5rem;
            background: transparent;
            border-radius: 8px 8px 0 0;
            font-weight: 500;
            color: #7F8C8D;
        }
        
        .stTabs [aria-selected="true"] {
            background: white;
            color: #4ECDC4;
            border-bottom: 3px solid #4ECDC4;
        }
        
        /* Metrics */
        [data-testid="stMetricValue"] {
            font-size: 2rem;
            font-weight: 700;
            color: #2C3E50;
        }
        
        [data-testid="stMetricDelta"] {
            font-size: 0.875rem;
            font-weight: 500;
        }
        
        /* Expander */
        .streamlit-expanderHeader {
            background: white;
            border-radius: 8px;
            padding: 1rem;
            font-weight: 500;
            border: 2px solid #E8E8E8;
        }
        
        .streamlit-expanderHeader:hover {
            border-color: #4ECDC4;
        }
        
        /* Alert boxes */
        .stAlert {
            border-radius: 8px;
            border-left: 4px solid;
            padding: 1rem;
            margin: 1rem 0;
        }
        
        /* Success alert */
        [data-baseweb="notification"][kind="positive"] {
            border-left-color: #2ECC71;
            background: #E8F8F0;
        }
        
        /* Error alert */
        [data-baseweb="notification"][kind="negative"] {
            border-left-color: #E74C3C;
            background: #FCE8E6;
        }
        
        /* Info alert */
        [data-baseweb="notification"][kind="info"] {
            border-left-color: #3498DB;
            background: #EBF5FB;
        }
        
        /* Warning alert */
        [data-baseweb="notification"][kind="warning"] {
            border-left-color: #F39C12;
            background: #FEF5E7;
        }
        
        /* Tables */
        .dataframe {
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .dataframe thead tr th {
            background: #4ECDC4 !important;
            color: white !important;
            font-weight: 600;
            padding: 1rem;
        }
        
        .dataframe tbody tr:nth-child(even) {
            background: #F8F9FA;
        }
        
        .dataframe tbody tr:hover {
            background: #F0FFFE;
        }
        
        /* Loading spinner */
        .stSpinner > div {
            border-top-color: #4ECDC4 !important;
        }
        
        /* Custom badge */
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .badge-primary {
            background: #E8F8F7;
            color: #4ECDC4;
        }
        
        .badge-success {
            background: #E8F8F0;
            color: #2ECC71;
        }
        
        .badge-warning {
            background: #FEF5E7;
            color: #F39C12;
        }
        
        .badge-error {
            background: #FCE8E6;
            color: #E74C3C;
        }
        
        /* Custom container */
        .custom-container {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            margin: 1rem 0;
        }
        
        /* Avatar */
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4ECDC4 0%, #7EDCD6 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 1rem;
        }
        
        /* Divider */
        .divider {
            height: 1px;
            background: #E8E8E8;
            margin: 2rem 0;
        }
        
        /* Icon button */
        .icon-button {
            background: transparent;
            border: none;
            color: #7F8C8D;
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 6px;
            transition: all 0.2s;
        }
        
        .icon-button:hover {
            background: #F8F9FA;
            color: #4ECDC4;
        }
        </style>
    """, unsafe_allow_html=True)
```

---

## Layout Structure

### Main Application Layout

```python
# services/frontend/app.py
import streamlit as st
from styles.custom import load_custom_css
from utils.auth import check_authentication

# Page config
st.set_page_config(
    page_title="MySmartNotes",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Load custom CSS
load_custom_css()

# Authentication check
if not check_authentication():
    st.switch_page("pages/login.py")

# Main layout structure
def main():
    # Header
    render_header()
    
    # Main content area
    col1, col2, col3 = st.columns([1, 6, 1])
    
    with col2:
        # Page routing based on navigation
        if st.session_state.current_page == "dashboard":
            render_dashboard()
        elif st.session_state.current_page == "lectures":
            render_lectures()
        elif st.session_state.current_page == "chat":
            render_chat()
        # ... other pages

def render_header():
    """Render top navigation header."""
    col1, col2, col3 = st.columns([2, 6, 2])
    
    with col1:
        st.markdown("""
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 2rem;">📚</span>
                <h2 style="margin: 0; color: #4ECDC4;">SmartNotes</h2>
            </div>
        """, unsafe_allow_html=True)
    
    with col3:
        # User menu
        render_user_menu()
```

### Grid System

```python
# Two-column layout
col1, col2 = st.columns(2)

with col1:
    st.write("Left column")

with col2:
    st.write("Right column")

# Three-column layout with different widths
col1, col2, col3 = st.columns([1, 2, 1])

# Four-column layout
col1, col2, col3, col4 = st.columns(4)

# Responsive grid with gap
col1, gap, col2 = st.columns([5, 0.5, 5])
```

---

## Navigation

### Sidebar Navigation

```python
# components/navigation.py
def render_sidebar():
    """Render sidebar navigation."""
    
    with st.sidebar:
        # Logo and title
        st.markdown("""
            <div style="text-align: center; padding: 1rem 0 2rem 0;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">📚</div>
                <h1 style="color: white; margin: 0; font-size: 1.5rem;">MySmartNotes</h1>
            </div>
        """, unsafe_allow_html=True)
        
        # Navigation menu
        st.markdown("---")
        
        # Dashboard
        if st.button("🏠 Dashboard", key="nav_dashboard", use_container_width=True):
            st.session_state.current_page = "dashboard"
            st.rerun()
        
        # Subjects & Lectures
        if st.button("📖 My Lectures", key="nav_lectures", use_container_width=True):
            st.session_state.current_page = "lectures"
            st.rerun()
        
        # Upload
        if st.button("⬆️ Upload Lecture", key="nav_upload", use_container_width=True):
            st.session_state.current_page = "upload"
            st.rerun()
        
        # Chat/Ask Questions
        if st.button("💬 Ask Questions", key="nav_chat", use_container_width=True):
            st.session_state.current_page = "chat"
            st.rerun()
        
        # Study Tools
        st.markdown("### 📝 Study Tools")
        
        if st.button("🎴 Flashcards", key="nav_flashcards", use_container_width=True):
            st.session_state.current_page = "flashcards"
            st.rerun()
        
        if st.button("📝 Generate Notes", key="nav_notes", use_container_width=True):
            st.session_state.current_page = "generate"
            st.rerun()
        
        if st.button("❓ Quiz", key="nav_quiz", use_container_width=True):
            st.session_state.current_page = "quiz"
            st.rerun()
        
        # Analytics
        st.markdown("---")
        if st.button("📊 Analytics", key="nav_analytics", use_container_width=True):
            st.session_state.current_page = "analytics"
            st.rerun()
        
        # Settings
        st.markdown("---")
        if st.button("⚙️ Settings", key="nav_settings", use_container_width=True):
            st.session_state.current_page = "settings"
            st.rerun()
        
        # Logout
        st.markdown("---")
        if st.button("🚪 Logout", key="nav_logout", use_container_width=True):
            st.session_state.clear()
            st.switch_page("pages/login.py")
```

### Top Navigation Tabs

```python
# Alternative: Top navigation tabs
def render_top_nav():
    """Render horizontal tab navigation."""
    
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "🏠 Dashboard",
        "📖 Lectures", 
        "💬 Chat",
        "📝 Study",
        "📊 Analytics"
    ])
    
    with tab1:
        render_dashboard()
    
    with tab2:
        render_lectures()
    
    with tab3:
        render_chat()
    
    with tab4:
        render_study_tools()
    
    with tab5:
        render_analytics()
```

### Breadcrumbs

```python
def render_breadcrumbs(path: list):
    """Render breadcrumb navigation."""
    
    breadcrumb_html = " > ".join([
        f"<a href='#' style='color: #4ECDC4; text-decoration: none;'>{item}</a>"
        if i < len(path) - 1 else f"<span style='color: #7F8C8D;'>{item}</span>"
        for i, item in enumerate(path)
    ])
    
    st.markdown(f"""
        <div style="padding: 0.5rem 0; color: #7F8C8D; font-size: 0.875rem;">
            {breadcrumb_html}
        </div>
    """, unsafe_allow_html=True)

# Usage
render_breadcrumbs(["Home", "Mathematics", "Calculus I", "Lecture 3"])
```

---

## Components

### Cards

```python
# components/cards.py
def render_card(title: str, content: str, footer: str = None, icon: str = None):
    """Render a styled card component."""
    
    icon_html = f'<span style="font-size: 2rem; margin-bottom: 0.5rem;">{icon}</span>' if icon else ''
    footer_html = f'<div class="card-subtitle">{footer}</div>' if footer else ''
    
    st.markdown(f"""
        <div class="card">
            {icon_html}
            <div class="card-title">{title}</div>
            {footer_html}
            <div>{content}</div>
        </div>
    """, unsafe_allow_html=True)

# Lecture card with actions
def render_lecture_card(lecture: dict):
    """Render lecture card with preview and actions."""
    
    col1, col2 = st.columns([3, 1])
    
    with col1:
        st.markdown(f"""
            <div class="card">
                <div style="display: flex; align-items: start; gap: 1rem;">
                    <div style="font-size: 2.5rem;">📄</div>
                    <div style="flex: 1;">
                        <div class="card-title">{lecture['title']}</div>
                        <div class="card-subtitle">
                            {lecture['subject']} • {lecture['page_count']} pages • 
                            Uploaded {lecture['uploaded_at']}
                        </div>
                        <div style="margin-top: 0.5rem;">
                            <span class="badge badge-primary">{lecture['status']}</span>
                        </div>
                    </div>
                </div>
            </div>
        """, unsafe_allow_html=True)
    
    with col2:
        st.button("👁️ View", key=f"view_{lecture['id']}")
        st.button("💬 Ask", key=f"ask_{lecture['id']}")
        st.button("📝 Notes", key=f"notes_{lecture['id']}")
        st.button("🗑️ Delete", key=f"delete_{lecture['id']}")

# Stat card
def render_stat_card(label: str, value: str, delta: str = None, icon: str = None):
    """Render statistics card."""
    
    delta_html = ''
    if delta:
        delta_color = "#2ECC71" if delta.startswith("+") else "#E74C3C"
        delta_html = f'<div style="color: {delta_color}; font-size: 0.875rem; font-weight: 600;">{delta}</div>'
    
    st.markdown(f"""
        <div class="card" style="text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">{icon}</div>
            <div style="font-size: 2rem; font-weight: 700; color: #2C3E50; margin-bottom: 0.25rem;">
                {value}
            </div>
            <div style="color: #7F8C8D; font-size: 0.875rem; margin-bottom: 0.5rem;">
                {label}
            </div>
            {delta_html}
        </div>
    """, unsafe_allow_html=True)
```

### Tables

```python
# components/tables.py
import pandas as pd

def render_lecture_table(lectures: list):
    """Render lectures in a formatted table."""
    
    # Convert to DataFrame
    df = pd.DataFrame(lectures)
    
    # Format columns
    df['uploaded_at'] = pd.to_datetime(df['uploaded_at']).dt.strftime('%Y-%m-%d %H:%M')
    
    # Display with custom styling
    st.dataframe(
        df[['title', 'subject', 'page_count', 'status', 'uploaded_at']],
        use_container_width=True,
        hide_index=True,
        column_config={
            "title": st.column_config.TextColumn("Lecture Title", width="large"),
            "subject": st.column_config.TextColumn("Subject", width="medium"),
            "page_count": st.column_config.NumberColumn("Pages", width="small"),
            "status": st.column_config.TextColumn("Status", width="small"),
            "uploaded_at": st.column_config.TextColumn("Uploaded", width="medium"),
        }
    )

# Interactive table with actions
def render_interactive_table(data: list):
    """Render table with row actions."""
    
    for i, row in enumerate(data):
        col1, col2, col3, col4, col5 = st.columns([3, 2, 2, 2, 1])
        
        with col1:
            st.write(f"**{row['title']}**")
        
        with col2:
            st.write(row['subject'])
        
        with col3:
            st.write(f"{row['page_count']} pages")
        
        with col4:
            st.markdown(f'<span class="badge badge-primary">{row["status"]}</span>', 
                       unsafe_allow_html=True)
        
        with col5:
            if st.button("⋮", key=f"menu_{i}"):
                st.session_state[f"show_menu_{i}"] = True
        
        if st.session_state.get(f"show_menu_{i}"):
            with st.popover("Actions", use_container_width=True):
                if st.button("👁️ View", key=f"action_view_{i}"):
                    view_lecture(row['id'])
                if st.button("💬 Ask Questions", key=f"action_chat_{i}"):
                    open_chat(row['id'])
                if st.button("📝 Generate Notes", key=f"action_notes_{i}"):
                    generate_notes(row['id'])
                if st.button("🗑️ Delete", key=f"action_delete_{i}"):
                    delete_lecture(row['id'])
```

### Lists

```python
# components/lists.py
def render_subject_list(subjects: list):
    """Render list of subjects."""
    
    for subject in subjects:
        with st.container():
            col1, col2, col3 = st.columns([1, 8, 1])
            
            with col1:
                # Subject color indicator
                st.markdown(f"""
                    <div style="
                        width: 40px; 
                        height: 40px; 
                        border-radius: 8px; 
                        background: {subject['color']};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.5rem;
                    ">{subject['icon']}</div>
                """, unsafe_allow_html=True)
            
            with col2:
                st.markdown(f"**{subject['name']}**")
                st.caption(f"{subject['lecture_count']} lectures • Last updated {subject['updated_at']}")
            
            with col3:
                if st.button("→", key=f"subject_{subject['id']}"):
                    st.session_state.selected_subject = subject['id']
                    st.rerun()
            
            st.markdown("<div class='divider'></div>", unsafe_allow_html=True)

# Checklist
def render_checklist(items: list, on_change=None):
    """Render interactive checklist."""
    
    for i, item in enumerate(items):
        checked = st.checkbox(
            item['label'],
            value=item.get('checked', False),
            key=f"check_{i}"
        )
        
        if checked != item.get('checked', False) and on_change:
            on_change(i, checked)
```

### Forms

```python
# components/forms.py
def render_login_form():
    """Render login form."""
    
    st.markdown("""
        <div style="max-width: 400px; margin: 4rem auto;">
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="font-size: 4rem;">📚</div>
                <h1 style="color: #2C3E50; margin: 1rem 0;">Welcome Back</h1>
                <p style="color: #7F8C8D;">Sign in to continue to MySmartNotes</p>
            </div>
        </div>
    """, unsafe_allow_html=True)
    
    with st.form("login_form"):
        email = st.text_input(
            "Email",
            placeholder="your.email@example.com",
            help="Enter your registered email address"
        )
        
        password = st.text_input(
            "Password",
            type="password",
            placeholder="••••••••",
            help="Enter your password"
        )
        
        col1, col2 = st.columns(2)
        
        with col1:
            remember = st.checkbox("Remember me")
        
        with col2:
            st.markdown("""
                <div style="text-align: right;">
                    <a href="#" style="color: #4ECDC4; text-decoration: none; font-size: 0.875rem;">
                        Forgot password?
                    </a>
                </div>
            """, unsafe_allow_html=True)
        
        submit = st.form_submit_button("Sign In", use_container_width=True)
        
        if submit:
            # Handle login
            pass
    
    st.markdown("""
        <div style="text-align: center; margin-top: 1rem; color: #7F8C8D;">
            Don't have an account? 
            <a href="#" style="color: #4ECDC4; text-decoration: none; font-weight: 600;">
                Sign Up
            </a>
        </div>
    """, unsafe_allow_html=True)

# Upload form
def render_upload_form():
    """Render lecture upload form."""
    
    with st.form("upload_form"):
        st.markdown("### 📤 Upload New Lecture")
        
        # Subject selection
        subject = st.selectbox(
            "Subject",
            options=["Mathematics", "Physics", "Chemistry", "Biology"],
            help="Select the subject for this lecture"
        )
        
        # Lecture title
        title = st.text_input(
            "Lecture Title",
            placeholder="e.g., Introduction to Calculus",
            help="Enter a descriptive title for your lecture"
        )
        
        # File upload
        uploaded_file = st.file_uploader(
            "Choose a file",
            type=['pdf', 'pptx', 'ppt'],
            help="Supported formats: PDF, PPTX, PPT (Max 100MB)"
        )
        
        # Additional options
        with st.expander("⚙️ Advanced Options"):
            ocr_language = st.selectbox(
                "OCR Language",
                options=["English", "Chinese", "Spanish", "French"],
                help="Language for text extraction"
            )
            
            extract_figures = st.checkbox(
                "Extract figures and diagrams",
                value=True,
                help="Automatically detect and extract visual elements"
            )
        
        # Submit button
        col1, col2 = st.columns([1, 1])
        
        with col1:
            cancel = st.form_submit_button("Cancel", use_container_width=True)
        
        with col2:
            submit = st.form_submit_button("Upload", use_container_width=True, type="primary")
        
        if submit and uploaded_file:
            # Handle upload
            with st.spinner("Uploading and processing..."):
                process_upload(uploaded_file, subject, title)
```

### Buttons

```python
# Different button styles
# Primary button (default)
st.button("Primary Action", type="primary")

# Secondary button
st.button("Secondary Action")

# Icon button
st.button("🔍 Search")

# Full width button
st.button("Sign In", use_container_width=True)

# Button with custom styling
st.markdown("""
    <button class="secondary-button" onclick="">
        Cancel
    </button>
""", unsafe_allow_html=True)

# Button group
col1, col2, col3 = st.columns(3)
with col1:
    st.button("Option A", use_container_width=True)
with col2:
    st.button("Option B", use_container_width=True)
with col3:
    st.button("Option C", use_container_width=True)
```

### Modals & Dialogs

```python
# components/modals.py
def render_confirmation_dialog(title: str, message: str, on_confirm=None):
    """Render confirmation dialog."""
    
    @st.dialog(title)
    def confirm_action():
        st.write(message)
        
        col1, col2 = st.columns(2)
        
        with col1:
            if st.button("Cancel", use_container_width=True):
                st.rerun()
        
        with col2:
            if st.button("Confirm", use_container_width=True, type="primary"):
                if on_confirm:
                    on_confirm()
                st.rerun()
    
    return confirm_action

# Usage
def delete_lecture(lecture_id: int):
    @st.dialog("Delete Lecture")
    def confirm_delete():
        st.warning("⚠️ This action cannot be undone!")
        st.write("Are you sure you want to delete this lecture?")
        
        col1, col2 = st.columns(2)
        
        with col1:
            if st.button("Cancel", use_container_width=True):
                st.rerun()
        
        with col2:
            if st.button("Delete", use_container_width=True, type="primary"):
                # Perform deletion
                api_delete_lecture(lecture_id)
                st.success("Lecture deleted successfully")
                time.sleep(1)
                st.rerun()
    
    confirm_delete()
```

### Progress Indicators

```python
# components/progress.py
def render_processing_status(task_id: str):
    """Render processing progress with live updates."""
    
    # Progress bar
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    # Poll for updates
    while True:
        status = get_task_status(task_id)
        
        progress_bar.progress(status['progress'] / 100)
        status_text.text(status['message'])
        
        if status['state'] == 'SUCCESS':
            st.success("✅ Processing complete!")
            break
        elif status['state'] == 'FAILURE':
            st.error("❌ Processing failed")
            break
        
        time.sleep(1)

# Spinner
with st.spinner("Processing your request..."):
    # Long running operation
    result = process_data()

# Step indicator
def render_step_indicator(current_step: int, total_steps: int):
    """Render step progress indicator."""
    
    steps = []
    for i in range(1, total_steps + 1):
        if i < current_step:
            steps.append(f'<div class="step completed">✓</div>')
        elif i == current_step:
            steps.append(f'<div class="step active">{i}</div>')
        else:
            steps.append(f'<div class="step">{i}</div>')
    
    st.markdown(f"""
        <div style="display: flex; justify-content: center; gap: 1rem; margin: 2rem 0;">
            {''.join(steps)}
        </div>
        
        <style>
        .step {{
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #E8E8E8;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: #7F8C8D;
        }}
        
        .step.active {{
            background: #4ECDC4;
            color: white;
        }}
        
        .step.completed {{
            background: #2ECC71;
            color: white;
        }}
        </style>
    """, unsafe_allow_html=True)
```

### Notifications & Alerts

```python
# Success message
st.success("✅ Lecture uploaded successfully!")

# Error message
st.error("❌ Failed to process lecture. Please try again.")

# Warning message
st.warning("⚠️ This lecture is still processing. Some features may be unavailable.")

# Info message
st.info("💡 Tip: Use specific questions for better answers.")

# Toast notification (custom)
def show_toast(message: str, type: str = "success"):
    """Show temporary toast notification."""
    
    colors = {
        "success": "#2ECC71",
        "error": "#E74C3C",
        "warning": "#F39C12",
        "info": "#3498DB"
    }
    
    st.markdown(f"""
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: {colors.get(type, colors['info'])};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
        ">
            {message}
        </div>
        
        <style>
        @keyframes slideIn {{
            from {{
                transform: translateX(400px);
                opacity: 0;
            }}
            to {{
                transform: translateX(0);
                opacity: 1;
            }}
        }}
        </style>
    """, unsafe_allow_html=True)
```

### Charts & Visualizations

```python
# components/charts.py
import plotly.graph_objects as go
import plotly.express as px

def render_study_time_chart(data: dict):
    """Render study time bar chart."""
    
    fig = go.Figure(data=[
        go.Bar(
            x=list(data.keys()),
            y=list(data.values()),
            marker_color='#4ECDC4',
            text=list(data.values()),
            textposition='auto',
        )
    ])
    
    fig.update_layout(
        title="Study Time by Subject (Last 30 Days)",
        xaxis_title="Subject",
        yaxis_title="Minutes",
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(family="Inter, sans-serif", color="#2C3E50"),
        height=400
    )
    
    st.plotly_chart(fig, use_container_width=True)

def render_progress_chart(subjects: list):
    """Render progress pie chart."""
    
    fig = px.pie(
        names=[s['name'] for s in subjects],
        values=[s['progress'] for s in subjects],
        color_discrete_sequence=['#4ECDC4', '#FF6B6B', '#F39C12', '#9B59B6', '#3498DB']
    )
    
    fig.update_traces(
        textposition='inside',
        textinfo='percent+label',
        hoverinfo='label+percent+value'
    )
    
    fig.update_layout(
        title="Progress by Subject",
        height=400,
        showlegend=False
    )
    
    st.plotly_chart(fig, use_container_width=True)

def render_flashcard_heatmap(data: list):
    """Render study activity heatmap."""
    
    # Create calendar heatmap
    fig = go.Figure(data=go.Heatmap(
        z=[[d['count'] for d in week] for week in data],
        colorscale='Greens',
        showscale=False
    ))
    
    fig.update_layout(
        title="Study Activity (Last 12 Weeks)",
        height=200,
        xaxis=dict(showticklabels=False),
        yaxis=dict(showticklabels=False)
    )
    
    st.plotly_chart(fig, use_container_width=True)
```

---

## Page Templates

### Dashboard Page

```python
# pages/dashboard.py
def render_dashboard():
    """Render main dashboard page."""
    
    st.title("📊 Dashboard")
    st.markdown("Welcome back! Here's your learning overview.")
    
    # Quick stats
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        render_stat_card("Total Lectures", "24", "+3", "📚")
    
    with col2:
        render_stat_card("Study Hours", "48.5h", "+5.2h", "⏱️")
    
    with col3:
        render_stat_card("Flashcards Due", "12", "-8", "🎴")
    
    with col4:
        render_stat_card("Subjects", "5", "+1", "📖")
    
    st.markdown("---")
    
    # Main content
    col1, col2 = st.columns([2, 1])
    
    with col1:
        # Recent lectures
        st.markdown("### 📖 Recent Lectures")
        render_lecture_table(get_recent_lectures())
        
        # Study time chart
        st.markdown("### 📈 Study Time This Week")
        render_study_time_chart(get_study_time_data())
    
    with col2:
        # Quick actions
        st.markdown("### ⚡ Quick Actions")
        
        if st.button("⬆️ Upload Lecture", use_container_width=True):
            st.session_state.current_page = "upload"
            st.rerun()
        
        if st.button("💬 Ask Question", use_container_width=True):
            st.session_state.current_page = "chat"
            st.rerun()
        
        if st.button("📝 Generate Notes", use_container_width=True):
            st.session_state.current_page = "generate"
            st.rerun()
        
        st.markdown("---")
        
        # Due flashcards
        st.markdown("### 🎴 Flashcards Due Today")
        render_flashcard_list(get_due_flashcards())
        
        if st.button("Start Review", use_container_width=True, type="primary"):
            st.session_state.current_page = "flashcards"
            st.rerun()
```

### Chat Interface

```python
# pages/chat.py
def render_chat_page():
    """Render chat/Q&A interface."""
    
    st.title("💬 Ask Questions")
    
    # Lecture selector
    col1, col2 = st.columns([3, 1])
    
    with col1:
        selected_lecture = st.selectbox(
            "Select lecture",
            options=get_user_lectures(),
            format_func=lambda x: x['title']
        )
    
    with col2:
        if st.button("📚 All Lectures"):
            selected_lecture = None
    
    st.markdown("---")
    
    # Chat container
    chat_container = st.container(height=500)
    
    with chat_container:
        # Display chat history
        for msg in st.session_state.get('chat_history', []):
            if msg['role'] == 'user':
                st.markdown(f"""
                    <div style="text-align: right; margin: 1rem 0;">
                        <div style="
                            display: inline-block;
                            background: #4ECDC4;
                            color: white;
                            padding: 0.75rem 1rem;
                            border-radius: 12px 12px 0 12px;
                            max-width: 70%;
                        ">
                            {msg['content']}
                        </div>
                    </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                    <div style="margin: 1rem 0;">
                        <div style="
                            display: inline-block;
                            background: white;
                            border: 2px solid #E8E8E8;
                            padding: 0.75rem 1rem;
                            border-radius: 12px 12px 12px 0;
                            max-width: 70%;
                        ">
                            {msg['content']}
                        </div>
                        
                        {render_sources(msg.get('sources', []))}
                    </div>
                """, unsafe_allow_html=True)
    
    # Input area
    col1, col2 = st.columns([9, 1])
    
    with col1:
        user_input = st.text_input(
            "Ask a question...",
            key="chat_input",
            label_visibility="collapsed",
            placeholder="Type your question here..."
        )
    
    with col2:
        send = st.button("Send", use_container_width=True, type="primary")
    
    if send and user_input:
        # Add user message
        st.session_state.chat_history.append({
            'role': 'user',
            'content': user_input
        })
        
        # Get AI response
        with st.spinner("Thinking..."):
            response = get_ai_response(user_input, selected_lecture)
        
        # Add AI response
        st.session_state.chat_history.append({
            'role': 'assistant',
            'content': response['answer'],
            'sources': response.get('sources', [])
        })
        
        st.rerun()

def render_sources(sources: list):
    """Render source references."""
    
    if not sources:
        return ""
    
    sources_html = "<div style='margin-top: 0.5rem; font-size: 0.75rem; color: #7F8C8D;'>"
    sources_html += "<strong>Sources:</strong> "
    sources_html += ", ".join([
        f"<a href='#' style='color: #4ECDC4;'>{s['title']} (p.{s['page']})</a>"
        for s in sources
    ])
    sources_html += "</div>"
    
    return sources_html
```

### Upload Page

```python
# pages/upload.py
def render_upload_page():
    """Render lecture upload page."""
    
    st.title("📤 Upload Lecture")
    
    # Step indicator
    render_step_indicator(
        current_step=st.session_state.get('upload_step', 1),
        total_steps=3
    )
    
    if st.session_state.get('upload_step', 1) == 1:
        # Step 1: File selection
        render_step_1()
    elif st.session_state.upload_step == 2:
        # Step 2: Details
        render_step_2()
    elif st.session_state.upload_step == 3:
        # Step 3: Processing
        render_step_3()

def render_step_1():
    """Step 1: File selection."""
    
    st.markdown("### Step 1: Select File")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        uploaded_file = st.file_uploader(
            "Choose your lecture file",
            type=['pdf', 'pptx', 'ppt'],
            help="Drag and drop or click to browse"
        )
        
        if uploaded_file:
            st.success(f"✅ Selected: {uploaded_file.name}")
            
            # File info
            st.markdown(f"""
                <div class="custom-container">
                    <strong>File Information</strong>
                    <ul>
                        <li>Name: {uploaded_file.name}</li>
                        <li>Size: {uploaded_file.size / 1024 / 1024:.2f} MB</li>
                        <li>Type: {uploaded_file.type}</li>
                    </ul>
                </div>
            """, unsafe_allow_html=True)
            
            if st.button("Continue →", use_container_width=True, type="primary"):
                st.session_state.uploaded_file = uploaded_file
                st.session_state.upload_step = 2
                st.rerun()
```

---

## Responsive Design

```python
# Detect screen size (using custom component or JavaScript)
def is_mobile():
    """Check if user is on mobile device."""
    return st.session_state.get('is_mobile', False)

# Responsive columns
if is_mobile():
    # Stack vertically on mobile
    render_content()
    render_sidebar_content()
else:
    # Side by side on desktop
    col1, col2 = st.columns([2, 1])
    with col1:
        render_content()
    with col2:
        render_sidebar_content()

# Responsive grid
def responsive_columns(n_cols_desktop: int, n_cols_mobile: int = 1):
    """Return responsive column configuration."""
    if is_mobile():
        return st.columns(n_cols_mobile)
    else:
        return st.columns(n_cols_desktop)

# Usage
cols = responsive_columns(n_cols_desktop=4, n_cols_mobile=2)
for i, col in enumerate(cols):
    with col:
        render_card(f"Card {i+1}")
```

---

## Accessibility

```python
# Accessible components
def render_accessible_button(label: str, icon: str = None):
    """Render accessible button with ARIA labels."""
    
    button_text = f"{icon} {label}" if icon else label
    
    st.markdown(f"""
        <button 
            class="stButton"
            role="button"
            aria-label="{label}"
            tabindex="0"
        >
            {button_text}
        </button>
    """, unsafe_allow_html=True)

# Keyboard navigation hints
st.markdown("""
    <div style="font-size: 0.875rem; color: #7F8C8D; margin-top: 2rem;">
        <strong>Keyboard Shortcuts:</strong>
        <ul>
            <li><kbd>Ctrl</kbd> + <kbd>K</kbd> - Quick search</li>
            <li><kbd>Ctrl</kbd> + <kbd>U</kbd> - Upload lecture</li>
            <li><kbd>Ctrl</kbd> + <kbd>Q</kbd> - Ask question</li>
        </ul>
    </div>
""", unsafe_allow_html=True)

# Alt text for images
st.image("lecture.png", caption="Lecture preview", use_column_width=True)

# Screen reader friendly tables
df = pd.DataFrame(data)
st.dataframe(df, use_container_width=True)  # Built-in screen reader support
```

---

For implementation examples, see [DEVELOPMENT.md](DEVELOPMENT.md).  
For component integration, see [ARCHITECTURE.md](ARCHITECTURE.md).
