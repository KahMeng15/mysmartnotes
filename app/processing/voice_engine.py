import os
import sys
import asyncio
from pydub import AudioSegment
from unittest.mock import MagicMock

# Mock deprecated TensorFlow estimator which malaya_boilerplate requires
sys.modules['tensorflow.python.estimator'] = MagicMock()
sys.modules['tensorflow.python.estimator.run_config'] = MagicMock()
sys.modules['tensorflow.python.training.training_ops'] = MagicMock()

from pywhispercpp.model import Model as WhisperModel
import malaya_speech
from app.processing.ai_client import AIClient
from io import BytesIO

MODELS_DIR = os.path.join(os.getcwd(), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

class VoiceEngine:
    def __init__(self):
        self.stt_model = None
        self.tts_model = None
        self.gemini_client = None

    async def initialize(self):
        # Initialize pywhispercpp (will auto-download to ~/.pywhispercpp, but we can set model path if needed, 
        # for now let pywhispercpp handle its own download of 'base' or 'tiny')
        if not self.stt_model:
            print("Loading Whisper STT model...")
            # We use 'base' instead of 'tiny' for significantly better transcription accuracy
            self.stt_model = WhisperModel('base', models_dir=MODELS_DIR)
        
        # Initialize edge-tts (no loading required as it's an API, but we'll mark tts_model as initialized)
        if not self.tts_model:
            print("Using edge-tts for TTS...")
            self.tts_model = "edge-tts"

        # We don't initialize gemini anymore
        print("Voice Engine Initialized.")

    def convert_audio_to_pcm16(self, audio_bytes: bytes) -> str:
        """Converts arbitrary audio bytes (like WebM) to 16kHz PCM WAV mono"""
        audio = AudioSegment.from_file(BytesIO(audio_bytes))
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        temp_path = os.path.join(MODELS_DIR, "temp_input.wav")
        audio.export(temp_path, format="wav")
        return temp_path

    async def transcribe(self, audio_path: str) -> str:
        # Allow pywhispercpp to auto-detect language to better handle English/Malay code-switching
        segments = self.stt_model.transcribe(audio_path)
        text = " ".join([seg.text for seg in segments])
        return text.strip()

    async def evaluate_context(self, transcription: str, context: str, grading_mode: str = 'lenient') -> dict:
        if grading_mode == 'strict':
            strict_text = "Grade STRICTLY. Require exact terminology and complete lists. Do not accept partial matches or missing items."
        else:
            strict_text = "Grade LENIENTLY. If the user captures the basic conceptual essence or provides a partial correct answer, mark it as 'Correct'. Do not penalize for missing terminology, missing items in a list, or loose phrasing."

        prompt = f"""
        You are an educational evaluator. The user provided an answer aloud.
        Target Concept/Context: {context}
        User's Answer (Transcribed): {transcription}
        
        {strict_text}

        Classify the user's answer into one of: 'Correct', 'Inaccurate', or 'Vague'.
        Also provide a short coaching response (1-2 sentences) in a conversational, supportive tone.
        Respond in JSON format: {{"status": "...", "message": "..."}}
        """
        
        # Call global 3-tier AI System
        client = AIClient()
        try:
            # We request raw_output=True and parse JSON manually just like other modules
            response_text = await client.generate_text(
                prompt=prompt,
                max_tokens=150,
                raw_output=True
            )
            
            # Clean possible markdown wrap from the JSON
            import json
            cleaned = response_text.replace("```json", "").replace("```", "").strip()
            return json.loads(cleaned)
        except Exception as e:
            print(f"Eval Error: {e}")
            return {"status": "Vague", "message": "Sorry, I couldn't evaluate that locally."}

    async def synthesize(self, text: str) -> bytes:
        import edge_tts
        
        # We use a natural-sounding US English voice
        communicate = edge_tts.Communicate(text, "en-US-AriaNeural")
        out_path = os.path.join(MODELS_DIR, "temp_out.mp3")
        
        await communicate.save(out_path)
        
        with open(out_path, "rb") as f:
            audio_bytes = f.read()
        return audio_bytes

voice_engine = VoiceEngine()
