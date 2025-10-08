from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
import requests


class Settings(BaseSettings):
    LABIBA_BASE_URL: str = "https://chat.labibabot.com"
    LABIBA_STORY_ID: str = "4ca0fa63-f35f-4a8f-bfdf-3212878dac7a"
    model_config = SettingsConfigDict(env_file=[".env"], extra="ignore")


settings = Settings()
router = APIRouter()


class AskRequest(BaseModel):
    query: str
    storyId: str | None = None


class AskResponse(BaseModel):
    text: str
    raw: dict | None = None


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    url = f"{settings.LABIBA_BASE_URL.rstrip('/')}/api/Chatbot/LabibaMessage"
    payload = {
        "query": req.query,
        "storyId": req.storyId or settings.LABIBA_STORY_ID,
    }
    try:
        resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Labiba API error: {e}")

    try:
        data = resp.json()
    except ValueError:
        data = {"text": resp.text}

    # Extract message from nested structure: result.fulfillment[0].message
    text = None
    if isinstance(data, dict):
        result = data.get("result", {})
        if isinstance(result, dict):
            fulfillment = result.get("fulfillment", [])
            if isinstance(fulfillment, list) and len(fulfillment) > 0:
                message = fulfillment[0].get("message", "")
                # Strip HTML tags like <div dir='rtl'>...</div>
                import re
                text = re.sub(r'<[^>]+>', '', message).strip()

    # Fallback if extraction failed
    if not text:
        text = (
            (data.get("text") if isinstance(data, dict) else None)
            or (data.get("response") if isinstance(data, dict) else None)
            or (data.get("message") if isinstance(data, dict) else None)
            or resp.text
        )

    return AskResponse(text=text, raw=data if isinstance(data, dict) else None)


