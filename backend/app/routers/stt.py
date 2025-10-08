from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
import tempfile
import os
import logging
import requests
import time
import base64
import io
import wave

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
    PYDUB_ERROR = None
except ImportError as e:
    PYDUB_AVAILABLE = False
    PYDUB_ERROR = str(e)
except Exception as e:
    PYDUB_AVAILABLE = False
    PYDUB_ERROR = str(e)


class Settings(BaseSettings):
    HAMSA_API_KEY: str = "6420bc98-5f41-4675-8733-05449656b113"
    HAMSA_BASE_URL: str = "https://api.tryhamsa.com/v1"
    model_config = SettingsConfigDict(
        env_file=[os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")],
        extra="ignore"
    )


settings = Settings()
router = APIRouter()
logger = logging.getLogger("stt")

logger.info(f"Hamsa API initialized | key={settings.HAMSA_API_KEY[:8]}...")
logger.info(f"pydub available: {PYDUB_AVAILABLE}")
if not PYDUB_AVAILABLE:
    logger.warning(f"pydub import error: {PYDUB_ERROR}")


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...), prompt: str | None = Form(default=None)):
    """
    Transcribe audio using Hamsa real-time STT API with base64 encoding
    Sends audio directly as base64 (Hamsa will handle format)
    """
    if not settings.HAMSA_API_KEY:
        raise HTTPException(status_code=500, detail="HAMSA_API_KEY not set")

    logger.info("STT transcribe request received via Hamsa API")

    try:
        content = await audio.read()
        size = len(content or b"")
        logger.info(f"Received audio upload | size={size} bytes")
        if size == 0:
            raise HTTPException(status_code=400, detail="Empty audio upload")

        # Frontend now sends WAV, just encode it directly
        logger.info("Using audio as-is (already WAV from frontend)")
        audio_base64 = base64.b64encode(content).decode('utf-8')
        logger.info(f"Encoded to base64 | length={len(audio_base64)}")

        # Use real-time STT endpoint
        stt_url = f"{settings.HAMSA_BASE_URL}/realtime/stt"

        payload = {
            "audioBase64": audio_base64,
            "language": "ar",
            "isEosEnabled": False
        }

        logger.info("Calling Hamsa real-time STT API...")
        response = requests.post(
            stt_url,
            headers={
                "Authorization": f"Token {settings.HAMSA_API_KEY}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=60
        )

        logger.info(f"Hamsa response status: {response.status_code}")

        if response.status_code != 200:
            logger.error(f"Hamsa STT error: {response.status_code} | {response.text}")
            raise HTTPException(status_code=502, detail=f"Hamsa API error: {response.text}")

        result = response.json()
        logger.info(f"Hamsa response: {result}")

        # Extract text from response - check nested data object
        text = ""
        if "data" in result and isinstance(result["data"], dict):
            text = result["data"].get("text", "") or result["data"].get("transcription", "")
        else:
            text = result.get("text", "") or result.get("transcription", "") or result.get("transcript", "")

        if not text:
            logger.error(f"No text in response: {result}")
            raise HTTPException(status_code=502, detail=f"No transcription in response: {result}")

        logger.info(f"Transcription successful: {text}")
        return TranscribeResponse(text=text)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=400, detail=f"Transcription error: {e}")


@router.get("/debug")
def debug():
    return {
        "hamsa_key_present": bool(settings.HAMSA_API_KEY),
        "hamsa_api": settings.HAMSA_BASE_URL,
    }


