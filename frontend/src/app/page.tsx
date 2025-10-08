"use client";
import { useEffect, useRef, useState } from "react";
import { startRecognition } from "@/lib/stt";
import Waveform from "@/components/Waveform";
import VoiceCard from "@/components/VoiceCard";
import Header from "@/components/Header";
import { askAnswer } from "@/lib/answers";
import { synthesizeAndPlay } from "@/lib/tts";
import { HamsaRealtimeClient } from "@/lib/hamsa-realtime";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [partial, setPartial] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isActive, setIsActive] = useState(false);
  const isActiveRef = useRef(false);
  const stopFn = useRef<null | (() => void)>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const isProcessing = useRef(false);
  const isTTSPlaying = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const hamsaClient = useRef<HamsaRealtimeClient | null>(null);
  const audioChunksBuffer = useRef<ArrayBuffer[]>([]);
  const isCollectingAudio = useRef(false);

  useEffect(() => {
    // load saved voice
    const saved = localStorage.getItem("voiceId");
    if (saved) setVoiceId(saved);
    return () => {
      stopFn.current?.();
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function playCollectedAudioChunks() {
    if (audioChunksBuffer.current.length === 0) {
      console.log("No audio chunks to play");
      return;
    }

    try {
      console.log(`Playing ${audioChunksBuffer.current.length} audio chunks`);

      // Convert ArrayBuffers to Uint8Arrays like in the example
      const uint8Chunks = audioChunksBuffer.current.map(chunk => new Uint8Array(chunk));

      // Create blob directly from the chunks array (like the example)
      const blob = new Blob(uint8Chunks, { type: 'audio/wav' });

      console.log(`Created blob: ${blob.size} bytes`);

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1.0;

      await new Promise<void>((resolve, reject) => {
        audio.oncanplaythrough = () => {
          console.log("Audio can play through");
        };

        audio.onended = () => {
          console.log("Audio playback completed");
          URL.revokeObjectURL(url);
          resolve();
        };

        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          URL.revokeObjectURL(url);
          reject(e);
        };

        console.log("Starting audio playback...");
        audio.play().catch((err) => {
          console.error("Play error:", err);
          reject(err);
        });
      });
    } catch (error) {
      console.error("Error playing collected audio:", error);
    } finally {
      // Clear the buffer
      audioChunksBuffer.current = [];
      isCollectingAudio.current = false;
    }
  }

  // Initialize Hamsa WebSocket for Jasem
  async function startHamsaRealtime() {
    if (hamsaClient.current?.isConnected()) return;

    let transcriptBuffer = "";
    let transcriptTimeout: NodeJS.Timeout | null = null;

    hamsaClient.current = new HamsaRealtimeClient({
      onTranscript: (text, isFinal) => {
        console.log("Transcript:", text, "Final:", isFinal);

        // Accumulate transcripts
        transcriptBuffer += (transcriptBuffer ? " " : "") + text;
        setPartial(transcriptBuffer);

        // Clear previous timeout
        if (transcriptTimeout) {
          clearTimeout(transcriptTimeout);
        }

        // Wait 0.8 seconds after last transcript to consider it final
        transcriptTimeout = setTimeout(() => {
          if (transcriptBuffer.trim() && !isProcessing.current) {
            console.log("Final transcript:", transcriptBuffer);

            // Final transcription - send to AI
            const finalText = transcriptBuffer;
            transcriptBuffer = "";
            setPartial("");
            setMessages((prev) => [...prev, { role: "user", content: finalText }]);

            // Get AI response
            isProcessing.current = true;
            setIsLoadingResponse(true);
            askAnswer(finalText).then(async (answer) => {
              setIsLoadingResponse(false);

              // Show message when TTS starts playing
              const showMessage = () => {
                setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
              };

              // Use HTTP TTS with sync (WebSocket TTS returns invalid audio format)
              try {
                await synthesizeAndPlay(answer, "jasem", undefined, showMessage);
              } catch (ttsError) {
                console.error("TTS error:", ttsError);
                showMessage();
              }

              isProcessing.current = false;
            }).catch((error) => {
              console.error("AI error:", error);
              setIsLoadingResponse(false);
              isProcessing.current = false;
            });
          }
        }, 800);
      },
      onAudio: (audioData) => {
        console.log("Received TTS audio chunk:", audioData.byteLength, "bytes");
        if (audioData && audioData.byteLength > 0 && isCollectingAudio.current) {
          audioChunksBuffer.current.push(audioData);
        }
      },
      onTTSEnd: () => {
        console.log("TTS end signal received, playing collected audio...");
        playCollectedAudioChunks();
      },
      onError: (error) => {
        console.error("Hamsa error:", error);
      },
      onConnect: () => {
        console.log("Hamsa connected, starting recording...");
        hamsaClient.current?.startRecording();
      },
      onDisconnect: () => {
        console.log("Hamsa disconnected");
      },
    });

    await hamsaClient.current.connect();
  }

  function stopHamsaRealtime() {
    if (hamsaClient.current) {
      hamsaClient.current.disconnect();
      hamsaClient.current = null;
    }
    audioChunksBuffer.current = [];
    isCollectingAudio.current = false;
  }

  async function handleTranscription(text: string) {
    if (isProcessing.current) return;
    isProcessing.current = true;

    // STOP listening immediately to prevent background noise capture
    if (stopFn.current) {
      console.log("Stopping current recording before processing...");
      stopFn.current();
      stopFn.current = null;
    }

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      // Show loading indicator
      setIsLoadingResponse(true);

      const answer = await askAnswer(text);

      // Prepare callback to show message when TTS starts playing
      const showMessage = () => {
        setIsLoadingResponse(false);
        setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
        isTTSPlaying.current = true; // Mark TTS as playing
      };

      const onTTSFinish = () => {
        isTTSPlaying.current = false; // Mark TTS as finished
        console.log("TTS finished playing");
      };

      // Play TTS and show message when it starts
      if (voiceId === "jasem") {
        await synthesizeAndPlay(answer, "jasem", undefined, showMessage).then(onTTSFinish).catch((ttsError) => {
          console.error("TTS playback error:", ttsError);
          showMessage(); // Show message even if TTS fails
          onTTSFinish();
        });
      } else if (voiceId === "sara") {
        await synthesizeAndPlay(answer, "sara", undefined, showMessage).then(onTTSFinish).catch((ttsError) => {
          console.error("TTS playback error:", ttsError);
          showMessage();
          onTTSFinish();
        });
      } else if (voiceId === "abdullah") {
        await synthesizeAndPlay(answer, "abdullah", undefined, showMessage).then(onTTSFinish).catch((ttsError) => {
          console.error("TTS playback error:", ttsError);
          showMessage();
          onTTSFinish();
        });
      } else {
        // If no voice selected, show message immediately
        showMessage();
        onTTSFinish();
      }
    } catch (e) {
      console.error(e);
      setIsLoadingResponse(false);
      isTTSPlaying.current = false;
    } finally {
      isProcessing.current = false;

      // Restart listening after everything is done
      if (isActiveRef.current) {
        console.log("Restarting listening after TTS...");
        setTimeout(() => startListening(), 500);
      }
    }
  }

  async function startListening() {
    console.log("startListening called, isActive:", isActiveRef.current);
    if (!isActiveRef.current) {
      console.log("Not active, skipping");
      return;
    }
    try {
      stopFn.current = await startRecognition(async () => ({}), {
        onPartial: setPartial,
        onFinal: async (t) => {
          console.log("Final transcription:", t);
          setPartial("");
          await handleTranscription(t);
        },
        onError: (e) => {
          console.error("STT Error:", e);
          // Retry listening if still active
          if (isActiveRef.current) {
            setTimeout(() => startListening(), 1000);
          }
        },
      }, {
        silenceDuration: 800 // 0.8 seconds of silence to detect end of speech
      });
      console.log("Recognition started successfully");
    } catch (error) {
      console.error("Failed to start recognition:", error);
      setIsActive(false);
    }
  }

  async function onToggle() {
    console.log("Toggle clicked, current isActive:", isActive);
    if (!isActive) {
      // Start continuous mode
      setIsActive(true);
      isActiveRef.current = true;
      // Start listening immediately for all voices (using HTTP STT)
      startListening();
    } else {
      // Stop continuous mode
      setIsActive(false);
      isActiveRef.current = false;
      stopFn.current?.();
      stopFn.current = null;
    }
  }

  function onSelectVoiceAction(id: string) {
    setVoiceId(id);
    localStorage.setItem("voiceId", id);
  }

  return (
    <div className="min-h-screen w-full bg-[#E8E8E8] flex flex-col relative">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20 pointer-events-none"
        style={{ backgroundImage: 'url(/background.jpg)' }}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
      <Header />
      <div className="flex-1 px-4 md:px-6 pb-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 max-w-[1600px] mx-auto w-full">
        <div className="bg-white rounded-3xl shadow-lg p-6 md:p-8 flex flex-col">
          <h1 className="text-2xl md:text-3xl font-semibold mb-6">AI Voice Agents</h1>

          {/* Chat Messages Area */}
          <div className="flex-1 overflow-auto mb-6 space-y-4 scrollbar-hide" dir="rtl">
            {messages.length === 0 && !partial && (
              <div className="h-full flex items-center justify-center text-neutral-400">
                <p>ابدأ المحادثة بالضغط على زر التشغيل</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-[#F0F0F0] text-neutral-800"
                      : "bg-[#C8102E] text-white"
                  }`}
                >
                  <p className="text-base leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}

            {/* Show partial transcription while speaking */}
            {partial && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[#F0F0F0] text-neutral-800 opacity-60">
                  <p className="text-base leading-relaxed">{partial}</p>
                </div>
              </div>
            )}

            {/* Show loading indicator for AI response */}
            {isLoadingResponse && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[#C8102E] text-white">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                    <span className="text-sm">جاري المعالجة...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Waveform height={50} />
            </div>
            <button
              onClick={onToggle}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white transition shadow-lg flex-shrink-0 ${
                isActive ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#C8102E] hover:bg-[#A00D25]'
              }`}
              title={isActive ? "Stop conversation" : "Start conversation"}
            >
              {!isActive ? (
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                  <path d="M2 2L18 12L2 22V2Z" fill="white" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="6" y="6" width="12" height="12" fill="white" rx="2"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        <aside className="space-y-4">
          <h2 className="text-lg md:text-xl font-semibold px-1">Select a Voice</h2>
          <div className="space-y-3">
            <VoiceCard id="jasem" name="Jasem" avatar="/avatars/jasem.jpg" selectedId={voiceId} onSelectAction={onSelectVoiceAction} />
            <VoiceCard id="sara" name="Sara" avatar="/avatars/sara.jpg" selectedId={voiceId} onSelectAction={onSelectVoiceAction} />
            <VoiceCard id="abdullah" name="Abdullah" avatar="/avatars/abdullah.jpg" selectedId={voiceId} onSelectAction={onSelectVoiceAction} />
          </div>
        </aside>
      </div>
      <footer className="px-4 md:px-6 py-3 text-xs md:text-sm text-neutral-400 text-center">
        All Rights Reserved © 2025
      </footer>
      </div>
    </div>
  );
}
