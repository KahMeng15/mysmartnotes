"""Support and legal documents router"""
import os
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

router = APIRouter(prefix="/support", tags=["support"])

# Get the path to static files
STATIC_DIR = Path(__file__).parent.parent / "static" / "support"

NOT_FOUND_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Not Found</title>
    <link rel=\"stylesheet\" href=\"/styles/master.css\">
    <link rel=\"stylesheet\" href=\"/styles/support.css\">
    <style>
        .not-found-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        .not-found-content {
            max-width: 600px;
            padding: 2rem;
            text-align: center;
        }
        
        .not-found-content h1 {
            color: var(--color-error);
            margin-bottom: 1rem;
        }
        
        .not-found-content p {
            color: var(--color-gray);
            margin-bottom: 1.5rem;
        }
        
        .not-found-content ul {
            list-style: none;
            padding: 0;
            text-align: left;
            display: inline-block;
        }
        
        .not-found-content li {
            margin-bottom: 0.75rem;
        }
        
        .not-found-content a {
            color: var(--color-primary);
            font-weight: 600;
        }
    </style>
</head>
<body class="support-document">
    <div class="not-found-container">
        <div class="not-found-content">
            <h1>404 - Document Not Found</h1>
            <p>The requested support document could not be found.</p>
            <p>Available documents:</p>
            <ul>
                <li><a href="/support/termsofservice">Terms of Service</a></li>
                <li><a href="/support/privacypolicy">Privacy Policy</a></li>
                <li><a href="/support/fairuse">Fair Use Policy</a></li>
                <li><a href="/support/license">License</a></li>
            </ul>
        </div>
    </div>
</body>
</html>
"""


@router.get("/{doc}", response_class=HTMLResponse)
async def get_support_doc(doc: str):
    """
    Serve legal and support documents from static HTML files.
    
    Available documents:
    - /support/termsofservice - Terms of Service
    - /support/privacypolicy - Privacy Policy
    - /support/fairuse - Fair Use Policy
    - /support/license - License
    """
    # Map document names to file names
    doc_map = {
        "termsofservice": "termsofservice.html",
        "privacypolicy": "privacypolicy.html",
        "fairuse": "fairuse.html",
        "license": "license.html",
    }
    
    # Check if document is available
    if doc not in doc_map:
        return NOT_FOUND_HTML, 404
    
    # Construct file path
    file_path = STATIC_DIR / doc_map[doc]
    
    # Check if file exists
    if not file_path.exists():
        return NOT_FOUND_HTML, 404
    
    # Read and return the file content
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return content
    except Exception:
        return NOT_FOUND_HTML, 404
