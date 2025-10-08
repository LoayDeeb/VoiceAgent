from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import stt, answers, tts, ws_proxy

app = FastAPI(title="Albilad Voice Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stt.router, prefix="/api/stt", tags=["stt"])
app.include_router(answers.router, prefix="/api/answers", tags=["answers"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])
app.include_router(ws_proxy.router, prefix="/api/ws", tags=["websocket"])


