# Albilad Voice AI Assistant

An AI-powered voice assistant with Arabic language support, featuring three voice options and real-time speech-to-text/text-to-speech capabilities.

## Features

- 🎤 **Three Voice Options**: Jasem, Sara, and Abdullah
- 🗣️ **Real-time Speech-to-Text**: 0.8s silence detection
- 🔊 **Text-to-Speech**: Synchronized with text display
- 💬 **Continuous Conversation Mode**: Natural conversation flow
- 🇸🇦 **Arabic Language Support**: Full RTL support
- 🤖 **AI Integration**: Connected to Labiba chatbot
- 🎯 **Multiple TTS Providers**: Hamsa, Fish Audio, Lahajati

## Tech Stack

### Frontend
- Next.js 15 with TypeScript
- React 19
- Tailwind CSS
- Web Audio API for real-time audio processing

### Backend
- FastAPI (Python)
- OpenAI Whisper for STT
- Multiple TTS providers (Hamsa, Fish Audio, Lahajati)
- WebSocket support for real-time communication

## Deployment to Render

### Prerequisites
- GitHub account
- Render account (https://render.com)
- API keys for:
  - OpenAI (for STT)
  - Labiba chatbot
  - Hamsa API (optional)
  - Fish Audio API (optional)
  - Lahajati API (optional)

### Steps

1. **Fork/Clone this repository**
   ```bash
   git clone https://github.com/LoayDeeb/VoiceAgent.git
   ```

2. **Connect to Render**
   - Go to https://render.com/dashboard
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select `VoiceAgent` repository

3. **Configure Environment Variables**

   Render will automatically detect the `render.yaml` file. You need to add these environment variables:

   **Backend Service:**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `LABIBA_SESSION_ID`: Your Labiba session ID
   - `LABIBA_STORY_ID`: Your Labiba story ID
   - `HAMSA_API_KEY`: Your Hamsa API key (if using Jasem voice)
   - `FISH_AUDIO_API_KEY`: Your Fish Audio API key (if using Sara voice)
   - `LAHAJATI_API_KEY`: Your Lahajati API key (if using Abdullah voice)

   **Frontend Service:**
   - `NEXT_PUBLIC_BACKEND_URL`: Will be auto-filled from backend service URL

4. **Deploy**
   - Click "Apply" to deploy both services
   - Wait for build and deployment (5-10 minutes)
   - Your app will be live at the provided URLs

### Local Development

#### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
uvicorn app.main:app --reload --port 8000
```

#### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with backend URL
npm run dev
```

Visit http://localhost:3001

## Environment Variables

### Backend (.env)
```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_STT_MODEL=gpt-4o-transcribe
LABIBA_BASE_URL=https://chat.labibabot.com
LABIBA_SESSION_ID=your_session_id
LABIBA_STORY_ID=your_story_id
HAMSA_API_KEY=your_hamsa_key (optional)
FISH_AUDIO_API_KEY=your_fish_audio_key (optional)
LAHAJATI_API_KEY=your_lahajati_key (optional)
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## API Providers

- **Hamsa AI**: https://tryhamsa.com (Jasem voice - Bahraini dialect)
- **Fish Audio**: https://fish.audio (Sara voice)
- **Lahajati**: https://lahajati.ai (Abdullah voice)
- **Labiba**: https://labibabot.com (AI chatbot)

## License

All Rights Reserved © 2025

## Credits

🤖 Built with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
