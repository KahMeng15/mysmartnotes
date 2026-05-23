#!/usr/bin/env python3
"""
Test script for the /chat/ask endpoint.
Requires the server to be running at http://localhost:8000.
"""

import os
import sys
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

# Add project root to path
_PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

# Load .env
load_dotenv(dotenv_path=_PROJECT_ROOT / ".env")

def test_chat_endpoint():
    base_url = "http://localhost:8000"
    
    # Configuration
    email = os.getenv("ADMIN_EMAIL")
    password = os.getenv("ADMIN_PASSWORD")
    lecture_id = "nt_3e25d818" # Replace with a valid ID from your DB if this fails
    
    if not email or not password:
        print("❌ ADMIN_EMAIL or ADMIN_PASSWORD not found in .env")
        return

    print(f"🔐 Logging in as {email}...")
    
    session = requests.Session()
    login_res = session.post(f"{base_url}/auth/login", json={
        "email": email,
        "password": password
    })
    
    if login_res.status_code != 200:
        print(f"❌ Login failed ({login_res.status_code}): {login_res.text}")
        return
    
    print("✅ Login successful")
    
    # Get CSRF token from cookies
    csrf_token = session.cookies.get("csrf_token")
    headers = {
        "X-CSRF-Token": csrf_token
    }
    
    # Test Chat
    chat_payload = {
        "lecture_id": lecture_id,
        "message": "What framework is discussed for analyzing Malaysian ethics?",
        "ai_mode": "normal",
        "output_format": "sentence"
    }
    
    print(f"\n💬 Sending chat request to /chat/ask...")
    print(f"Payload: {json.dumps(chat_payload, indent=2)}")
    
    try:
        # Chat might take a while, especially with Gemma 4 reasoning
        chat_res = session.post(f"{base_url}/chat/ask", json=chat_payload, headers=headers, timeout=120)
        
        if chat_res.status_code == 200:
            data = chat_res.json()
            print("\n✅ Chat Response:")
            print(f"--- Model: {data.get('ai_model')} ---")
            print(f"Response: {data.get('response')}")
            print(f"\n--- Timings ---")
            print(json.dumps(data.get("timings"), indent=2))
            
            # Check for leaked reasoning
            response_text = data.get('response', '')
            if "<|channel|>thought" in response_text or "<|thought|>" in response_text:
                print("\n⚠️ WARNING: Detected leaked reasoning tokens in the response!")
            else:
                print("\n✨ Clean response! No reasoning tokens detected.")
                
        else:
            print(f"❌ Chat request failed ({chat_res.status_code}): {chat_res.text}")
            
    except requests.exceptions.Timeout:
        print("❌ Chat request timed out after 120 seconds")
    except Exception as e:
        print(f"❌ An error occurred: {e}")

if __name__ == "__main__":
    test_chat_endpoint()
