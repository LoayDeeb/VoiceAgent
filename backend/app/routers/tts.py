from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
import requests
import logging
import os


class Settings(BaseSettings):
    BADER_API_KEY: str = "sk_eyJpdiI6IkxHdEgyNDhVdnNDalA5anY0c0dXbXc9PSIsInZhbHVlIjoic3FkTEE4aFplZTd1QUh5YWJFMEdrV2pITm53djArK281bXNxcTJKeXdiRVlwQ0ZFTE42dFlYcWpkdFA1NW0wLyIsIm1hYyI6IjVhY2U5NGZkNTVkMTAzYTJiZTYxMzgxZDJhNDg3MmUyZGQwZTAyYTZjM2EyZDE2ZDU4NmEwZWJmNWEyZDFkNjkiLCJ0YWciOiIifQ=="
    BADER_BASE_URL: str = "https://lahajati.ai/api/v1"
    LAHAJATI_API_KEY: str = "sk_eyJpdiI6ImNDcEJQMVR4VjJlQkliZjE2MFEwZFE9PSIsInZhbHVlIjoidlYxVG9haHpLWlBOV210cHJMaVk4UE50d3ovZjVDOHpEdU45RnBWK3A1cHc0ZWNzTEdtTmU3YjVjMXo3N3FqYyIsIm1hYyI6ImJjYWJiMjE2YWNiMDE3NTVjYWM4OTMyNTQxYzhlZTQ1MDUxY2U4YmMyYmI2MWVkZDRlOWI3OGQxNWVkYjI0MmYiLCJ0YWciOiIifQ=="
    LAHAJATI_BASE_URL: str = "https://lahajati.ai"
    HAMSA_API_KEY: str = "6420bc98-5f41-4675-8733-05449656b113"
    HAMSA_BASE_URL: str = "https://api.tryhamsa.com/v1"
    FISH_API_KEY: str = "8e1dd7ee41a5430999925a78a4767766"
    FISH_BASE_URL: str = "https://api.fish.audio/v1"
    model_config = SettingsConfigDict(
        env_file=[os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")],
        extra="ignore"
    )


settings = Settings()
router = APIRouter()
logger = logging.getLogger("tts")


class TTSRequest(BaseModel):
    text: str
    voice_id: str = "1395"
    input_mode: str = "0"
    performance_id: str = "206"
    dialect_id: str = "2"
    provider: str = "jasem"  # Changed default to jasem
    speaker: str = "Jasem"
    dialect: str = "ksa"
    reference_id: str = "110ec41cca6e47eabfbbc36c16f893e4"  # For Fish Audio (Sara)


@router.post("/synthesize")
def synthesize(req: TTSRequest):
    """
    Convert text to speech using the specified provider.
    Currently supports: bader (Lahajati.ai), jasem (Hamsa), sara (Fish Audio), abdullah (Lahajati Pro)
    """
    if req.provider == "bader":
        return synthesize_bader(req)
    elif req.provider == "jasem":
        return synthesize_jasem(req)
    elif req.provider == "sara":
        return synthesize_sara(req)
    elif req.provider == "abdullah":
        return synthesize_abdullah(req)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")


def synthesize_bader(req: TTSRequest):
    """
    Synthesize speech using Bader (Lahajati.ai) TTS API
    """
    url = f"{settings.BADER_BASE_URL.rstrip('/')}/text-to-speech-absolute-control"

    headers = {
        "Authorization": settings.BADER_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }

    logger.info(f"Bader TTS request | Authorization header: {settings.BADER_API_KEY[:30]}...")

    payload = {
        "text": req.text,
        "id_voice": req.voice_id,
        "input_mode": req.input_mode,
        "performance_id": req.performance_id,
        "dialect_id": req.dialect_id
    }

    logger.info(f"Bader TTS request | text_length={len(req.text)} | voice_id={req.voice_id}")

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()

        # Check if response is audio
        content_type = resp.headers.get('content-type', '')
        if 'audio' not in content_type.lower():
            logger.error(f"Unexpected content type: {content_type}")
            raise HTTPException(status_code=502, detail=f"Bader API returned non-audio response: {content_type}")

        logger.info(f"Bader TTS success | audio_size={len(resp.content)} bytes")

        # Return audio as streaming response
        return StreamingResponse(
            iter([resp.content]),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )

    except requests.RequestException as e:
        logger.error(f"Bader API error: {e}")
        raise HTTPException(status_code=502, detail=f"Bader TTS API error: {e}")


def synthesize_jasem(req: TTSRequest):
    """
    Synthesize speech using Jasem (Hamsa) TTS API
    """
    url = f"{settings.HAMSA_BASE_URL.rstrip('/')}/realtime/tts"

    headers = {
        "Authorization": f"Token {settings.HAMSA_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": req.text,
        "speaker": req.speaker,
        "dialect": req.dialect,
        "mulaw": False
    }

    logger.info(f"Jasem TTS request | text_length={len(req.text)} | speaker={req.speaker} | dialect={req.dialect}")

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()

        # Check if response is audio
        content_type = resp.headers.get('content-type', '')
        logger.info(f"Jasem response content-type: {content_type}")

        if 'audio' not in content_type.lower():
            logger.error(f"Unexpected content type: {content_type} | response: {resp.text[:200]}")
            raise HTTPException(status_code=502, detail=f"Hamsa API returned non-audio response: {content_type}")

        logger.info(f"Jasem TTS success | audio_size={len(resp.content)} bytes")

        # Return audio as streaming response
        return StreamingResponse(
            iter([resp.content]),
            media_type=content_type or "audio/wav",
            headers={
                "Content-Disposition": "inline; filename=speech.wav"
            }
        )

    except requests.RequestException as e:
        logger.error(f"Jasem API error: {e}")
        raise HTTPException(status_code=502, detail=f"Jasem TTS API error: {e}")


def synthesize_sara(req: TTSRequest):
    """
    Synthesize speech using Sara (Fish Audio) TTS API
    """
    url = f"{settings.FISH_BASE_URL.rstrip('/')}/tts"

    headers = {
        "Authorization": f"Bearer {settings.FISH_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": req.text,
        "reference_id": req.reference_id,
        "format": "mp3",
        "mp3_bitrate": 128,
        "normalize": True,
        "latency": "normal"
    }

    logger.info(f"Sara TTS request | text_length={len(req.text)} | reference_id={req.reference_id}")

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()

        # Check if response is audio
        content_type = resp.headers.get('content-type', '')
        logger.info(f"Sara response content-type: {content_type}")

        # Fish Audio might return audio/mpeg or application/octet-stream
        logger.info(f"Sara TTS success | audio_size={len(resp.content)} bytes")

        # Return audio as streaming response
        return StreamingResponse(
            iter([resp.content]),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )

    except requests.RequestException as e:
        logger.error(f"Sara API error: {e}")
        raise HTTPException(status_code=502, detail=f"Sara TTS API error: {e}")


def synthesize_abdullah(req: TTSRequest):
    """
    Synthesize speech using Abdullah (Lahajati) TTS API
    Using text-to-speech-absolute-control endpoint
    """
    url = f"{settings.LAHAJATI_BASE_URL.rstrip('/')}/api/v1/text-to-speech-absolute-control"

    headers = {
        "Authorization": f"Bearer {settings.LAHAJATI_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }

    payload = {
        "text": req.text,
        "id_voice": "4ezf4a4fd4gf4erh8ez54dfb14",
        "input_mode": "0",
        "performance_id": "206",
        "dialect_id": "2"
    }

    logger.info(f"Abdullah TTS request | text_length={len(req.text)} | id_voice=4ezf4a4fd4gf4erh8ez54dfb14")

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        logger.info(f"Abdullah response status: {resp.status_code}")
        resp.raise_for_status()

        # Check if response is audio
        content_type = resp.headers.get('content-type', '')
        logger.info(f"Abdullah response content-type: {content_type} | audio_size={len(resp.content)} bytes")

        if 'audio' not in content_type.lower() and 'octet-stream' not in content_type.lower():
            logger.error(f"Unexpected content type: {content_type} | response: {resp.text[:200]}")
            raise HTTPException(status_code=502, detail=f"Lahajati API returned non-audio response: {content_type}")

        logger.info(f"Abdullah TTS success")

        # Return audio as streaming response
        return StreamingResponse(
            iter([resp.content]),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )

    except requests.RequestException as e:
        logger.error(f"Abdullah API error: {e}")
        raise HTTPException(status_code=502, detail=f"Abdullah TTS API error: {e}")


@router.get("/voices")
def get_voices(provider: str = "bader"):
    """
    Get available voices for the specified provider.
    """
    if provider == "bader":
        # Return default Bader voice configuration
        return {
            "provider": "bader",
            "voices": [
                {
                    "id": "1395",
                    "name": "Default Arabic Voice",
                    "dialect_options": [
                        {"id": "1", "name": "Gulf"},
                        {"id": "2", "name": "Levantine"}
                    ],
                    "performance_options": [
                        {"id": "206", "name": "Standard"}
                    ]
                }
            ]
        }
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
