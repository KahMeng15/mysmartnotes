# Global AI Settings Configuration

## Overview

MySmartNotes now supports **Global AI Settings** that allow administrators to configure a default AI provider and API key that users can optionally use instead of their personal settings. This is useful in organizations where you want to:

- Provide a single AI backend for all users (e.g., shared Gemini API key)
- Ensure consistency across the application
- Allow users to opt-in to use these centralized settings while still having personal settings available

## Configuration

### 1. Setting Global AI Provider and API Key

Edit the `.env` file and add the following variables:

```env
# Global AI Configuration (available for all users)
# Users can choose to use these global settings or their personal settings
GLOBAL_AI_PROVIDER=gemini
GLOBAL_GEMINI_API_KEY=your-shared-gemini-api-key-here
GLOBAL_AI_MODEL=gemini-pro
```

**Available Options:**
- `GLOBAL_AI_PROVIDER`: `gemini`, `huggingface`, or `ollama`
- `GLOBAL_GEMINI_API_KEY`: Your shared Gemini API key (required if using Gemini)
- `GLOBAL_AI_MODEL`: Model name to use (leave empty for defaults)

### 2. Example Configurations

#### Using Global Gemini
```env
GLOBAL_AI_PROVIDER=gemini
GLOBAL_GEMINI_API_KEY=AIzaSyD...YOUR_KEY...
GLOBAL_AI_MODEL=gemini-pro
```

#### Using Global Ollama
```env
GLOBAL_AI_PROVIDER=ollama
GLOBAL_AI_MODEL=qwen3:4b-thinking
```

## User Interface

### Accessing Global Settings

1. Log in to MySmartNotes
2. Navigate to **Settings** → **AI Settings**
3. You'll see a new toggle: **"Use Global AI Settings"**

### Personal vs. Global Settings

**Before toggling Global Settings:**
- You see fields for: AI Provider, Model Name, Base URL, API Key
- These are your personal settings

**After toggling Global Settings:**
- Personal setting fields are hidden
- You see a message: "📡 Global Settings Active"
- Shows which provider and model is configured

### Switching Between Settings

```
┌─────────────────────────────────────────┐
│ AI Settings                             │
├─────────────────────────────────────────┤
│ ☐ Use Global AI Settings               │  ← Toggle OFF (personal settings)
├─────────────────────────────────────────┤
│ AI Provider: [Google Gemini ▼]         │
│ Model Name: [gemini-pro]               │
│ API Key: [••••••••]                    │
│                                         │
│ [Save AI Preferences]                  │
└─────────────────────────────────────────┘

        ↓ (Toggle)

┌─────────────────────────────────────────┐
│ AI Settings                             │
├─────────────────────────────────────────┤
│ ☑ Use Global AI Settings               │  ← Toggle ON (global settings)
├─────────────────────────────────────────┤
│ 📡 Global Settings Active              │
│ Provider: Configured by administrator  │
│ Model: Configured by administrator    │
│                                         │
│ [Save AI Preferences]                  │
└─────────────────────────────────────────┘
```

## How It Works

### 1. User Preferences Storage
- Each user has a `use_global_ai_config` boolean flag in the database
- When `true`: Use global settings from .env
- When `false`: Use personal settings from user profile

### 2. Backend Logic (ai_client.py)

```python
# Determine if using global settings
use_global = user.use_global_ai_config if user else False

if use_global and user:
    # Use global settings from environment
    self.provider = settings.GLOBAL_AI_PROVIDER
    self.gemini_key = settings.GLOBAL_GEMINI_API_KEY
    self.ai_model_name = settings.GLOBAL_AI_MODEL
else:
    # Use user's personal settings
    self.provider = user.ai_provider
    self.gemini_key = user.ai_api_key
    self.ai_model_name = user.ai_model
```

### 3. Priority Order

When initializing AI client for a user:

1. **If global settings enabled**: Use `GLOBAL_*` from .env
2. **Else if personal settings configured**: Use user's personal settings
3. **Else**: Use root settings from .env (legacy fallback)

## Database Schema

### New Column in `users` Table

```sql
ALTER TABLE users ADD COLUMN use_global_ai_config BOOLEAN DEFAULT 0;
```

- `0` (False): Use personal settings
- `1` (True): Use global settings

### Updated User Schema

```python
class User(BaseModel):
    id: int
    username: str
    email: str
    ai_provider: str
    ai_model: Optional[str]
    ai_base_url: Optional[str]
    ai_api_key: Optional[str]
    use_global_ai_config: bool = False  # NEW
```

## API Changes

### Update User Profile Endpoint

**Endpoint:** `PUT /auth/profile`

**Request Body:**
```json
{
  "full_name": "John Doe",
  "nickname": "johndoe",
  "use_global_ai_config": true,
  "ai_provider": "gemini",           // Only used if use_global_ai_config=false
  "ai_model": "gemini-pro",          // Only used if use_global_ai_config=false
  "ai_base_url": "http://...",       // Only used if use_global_ai_config=false
  "ai_api_key": "sk-..."             // Only used if use_global_ai_config=false
}
```

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "ai_provider": "gemini",
  "use_global_ai_config": true,
  // ... other fields
}
```

## Migration

If updating an existing installation, run the migration script:

```bash
python scripts/migrate_global_ai_config.py
```

This adds the `use_global_ai_config` column to the `users` table with a default value of `False`.

## Example Scenarios

### Scenario 1: Organization with Shared Gemini API

**Admin Setup (.env):**
```env
GLOBAL_AI_PROVIDER=gemini
GLOBAL_GEMINI_API_KEY=AIzaSyD...SHARED_KEY...
GLOBAL_AI_MODEL=gemini-pro
```

**User Experience:**
1. User goes to Settings → AI Settings
2. Toggles "Use Global AI Settings" ON
3. Saves preferences
4. All their chat requests now use the shared Gemini key
5. Can toggle back to personal settings anytime

### Scenario 2: Mixed Setup (Some Global, Some Personal)

**Team A (Global):**
- Toggles global settings ON
- Uses shared company Gemini account

**Team B (Personal):**
- Leaves toggle OFF
- Each person enters their own API keys

### Scenario 3: Local Ollama Deployment

**Admin Setup (.env):**
```env
GLOBAL_AI_PROVIDER=ollama
GLOBAL_AI_MODEL=qwen3:4b-thinking
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

**User Experience:**
- All users can toggle to use local Ollama
- No API keys needed
- Consistent model across organization

## Troubleshooting

### User's global settings not taking effect

1. Check if toggle is ON in Settings → AI Settings
2. Verify `GLOBAL_AI_PROVIDER` is set in .env
3. Verify API key is correct if using Gemini
4. Restart the app: `pkill -f "python main.py" && python main.py`

### Can't find toggle option

- Make sure you're logged in
- Go to Settings page
- Look for "AI Settings" section → "Use Global AI Settings" toggle

### Want to switch back to personal settings

1. Go to Settings → AI Settings
2. Toggle "Use Global AI Settings" OFF
3. Enter your personal AI settings
4. Click "Save AI Preferences"

## Security Considerations

1. **Global API Keys**: Global API keys are stored in `.env` on the server
   - Keep `.env` file secure and out of version control
   - Use environment variables in production
   - Rotate keys periodically

2. **Personal API Keys**: User API keys are stored in the database
   - Stored as-is (no encryption in current version)
   - Consider adding database encryption in production

3. **Best Practices**:
   - Use global settings for controlled organizational environments
   - Require strong `.env` file permissions: `chmod 600 .env`
   - Don't commit `.env` to version control
   - Use separate API keys for development vs. production

## Future Enhancements

Potential improvements:
- [ ] Encryption of API keys in database
- [ ] Audit logging for which settings are used
- [ ] Admin panel to manage global settings without .env
- [ ] Per-group global settings (different settings for different teams)
- [ ] Rate limiting per global account
- [ ] Usage statistics per user/group

