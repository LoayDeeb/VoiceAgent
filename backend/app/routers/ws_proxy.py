from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic_settings import BaseSettings, SettingsConfigDict
import os
import asyncio
import websockets
import json
import logging

logger = logging.getLogger("ws_proxy")

class Settings(BaseSettings):
    HAMSA_API_KEY: str = "6420bc98-5f41-4675-8733-05449656b113"
    model_config = SettingsConfigDict(
        env_file=[os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")],
        extra="ignore"
    )

settings = Settings()
router = APIRouter()

HAMSA_WS_URL = "wss://api.tryhamsa.com/v1/realtime/ws"

@router.websocket("/hamsa-realtime")
async def hamsa_realtime_proxy(websocket: WebSocket):
    """
    Proxy WebSocket connection to Hamsa API with proper authentication headers
    """
    await websocket.accept()
    logger.info("Client connected to Hamsa proxy")

    try:
        # Connect to Hamsa WebSocket with authentication header
        # Use additional_headers parameter (correct syntax for websockets library)
        async with websockets.connect(
            HAMSA_WS_URL,
            additional_headers={
                "X-API-KEY": settings.HAMSA_API_KEY
            }
        ) as hamsa_ws:
            logger.info("Connected to Hamsa WebSocket")

            async def forward_to_hamsa():
                """Forward messages from client to Hamsa"""
                try:
                    while True:
                        data = await websocket.receive_text()
                        logger.info(f"Client -> Hamsa: {data[:100]}...")
                        await hamsa_ws.send(data)
                except WebSocketDisconnect:
                    logger.info("Client disconnected")
                except Exception as e:
                    logger.error(f"Error forwarding to Hamsa: {e}")

            async def forward_to_client():
                """Forward messages from Hamsa to client"""
                try:
                    async for message in hamsa_ws:
                        if isinstance(message, bytes):
                            # Binary data (TTS audio)
                            logger.info(f"Hamsa -> Client: binary data ({len(message)} bytes)")
                            await websocket.send_bytes(message)
                        else:
                            # Text data (JSON)
                            logger.info(f"Hamsa -> Client: {message[:100]}...")
                            await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Error forwarding to client: {e}")

            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_to_hamsa(),
                forward_to_client()
            )

    except Exception as e:
        logger.error(f"WebSocket proxy error: {e}")
        await websocket.close()
