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
            # We use a small model for speed and memory limit
            self.stt_model = WhisperModel('tiny', models_dir=MODELS_DIR)
        
        # Initialize malaya-speech VITS
        if not self.tts_model:
            print("Loading Malaya Speech TTS model...")
            # Using a fast quantized model if possible, or default vits
            self.tts_model = malaya_speech.tts.vits(model='mesolitica/VITS-osman', quantized=True)

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
        # Transcribe with MS language hint if pywhispercpp supports it, else default
        # pywhispercpp API: model.transcribe(audio_path, language='ms')
        segments = self.stt_model.transcribe(audio_path, language='ms')
        text = " ".join([seg.text for seg in segments])
        return text.strip()

    async def evaluate_context(self, transcription: str, context: str) -> dict:
        prompt = f"""
        You are an educational evaluator. The user provided an answer aloud.
        Target Concept/Context: {context}
        User's Answer (Transcribed): {transcription}

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
        # Generate TTS audio
        # malaya-speech returns numpy array
        y = self.tts_model(text)
        # Convert numpy array to WAV bytes
        import soundfile as sf
        import io
        out_f = io.BytesIO()
        sf.write(out_f, y['y'], 22050, format='WAV')
        return out_f.getvalue()

voice_engine = VoiceEngine()
