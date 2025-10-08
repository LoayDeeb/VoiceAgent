// Hamsa WebSocket realtime API for STT + TTS (via backend proxy for authentication)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
const WS_URL = BACKEND_URL.replace("http://", "ws://").replace("https://", "wss://");
const HAMSA_WS_PROXY_URL = `${WS_URL}/api/ws/hamsa-realtime`;

export type HamsaCallbacks = {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAudio?: (audioData: ArrayBuffer) => void;
  onTTSEnd?: () => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export class HamsaRealtimeClient {
  private ws: WebSocket | null = null;
  private callbacks: HamsaCallbacks;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;
  private processInterval: NodeJS.Timeout | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(callbacks: HamsaCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Connect to backend proxy which handles authentication
        console.log("Connecting to Hamsa via backend proxy:", HAMSA_WS_PROXY_URL);
        this.ws = new WebSocket(HAMSA_WS_PROXY_URL);

        this.ws.addEventListener('open', () => {
          console.log("Connected to Hamsa via backend proxy");
          this.callbacks.onConnect?.();
          resolve();
        });

        this.ws.addEventListener('message', (event) => {
          this.handleMessage(event.data);
        });

        this.ws.addEventListener('error', (error) => {
          console.error("WebSocket error:", error);
          this.callbacks.onError?.(new Error("WebSocket error"));
          reject(error);
        });

        this.ws.addEventListener('close', () => {
          console.log("Hamsa WebSocket closed");
          this.callbacks.onDisconnect?.();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: string | Blob | ArrayBuffer) {
    // Check if it's a Blob (from WebSocket)
    if (data instanceof Blob) {
      console.log("Received audio Blob:", data.size, "bytes");
      // Convert Blob to ArrayBuffer for audio playback
      data.arrayBuffer().then((arrayBuffer) => {
        this.callbacks.onAudio?.(arrayBuffer);
      });
      return;
    }

    if (typeof data === 'string') {
      // Try to parse as JSON first, if fails treat as plain text transcript
      try {
        const message = JSON.parse(data);
        console.log("Received WebSocket message:", message);

        if (message.type === 'transcript' || message.type === 'stt_response') {
          const text = message.payload?.text || message.text || '';
          const isFinal = message.payload?.isFinal ?? message.isFinal ?? true;
          if (text) {
            this.callbacks.onTranscript?.(text, isFinal);
          }
        } else if (message.type === 'end') {
          console.log("Received TTS end signal");
          this.callbacks.onTTSEnd?.();
        } else if (message.type === 'error') {
          const errorMsg = message.message || message.error || message.payload?.message || JSON.stringify(message);
          console.error("Hamsa error message:", errorMsg);
          this.callbacks.onError?.(new Error(errorMsg));
        } else if (message.error) {
          // Handle error in different format
          const errorMsg = typeof message.error === 'string' ? message.error : JSON.stringify(message.error);
          console.error("Hamsa error:", errorMsg);
          this.callbacks.onError?.(new Error(errorMsg));
        } else {
          console.log("Unknown message type:", message);
        }
      } catch (e) {
        // If JSON parse fails, treat as plain text transcript
        if (data.trim()) {
          console.log("Received plain text transcript:", data);
          this.callbacks.onTranscript?.(data, true);
        }
      }
    } else if (data instanceof ArrayBuffer) {
      // Binary data (TTS audio)
      console.log("Received audio ArrayBuffer:", data.byteLength, "bytes");
      this.callbacks.onAudio?.(data);
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: 16000 });

    // Use ScriptProcessor to capture raw PCM audio
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    const audioBuffers: Float32Array[] = [];
    let isSpeaking = false;

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);

      // Check if there's actual speech (volume threshold)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);

      // Only capture if there's significant audio (threshold: 0.01)
      if (rms > 0.01) {
        isSpeaking = true;
        audioBuffers.push(new Float32Array(inputData));
      } else if (isSpeaking && rms < 0.005) {
        // Silence detected after speech - don't clear immediately
        audioBuffers.push(new Float32Array(inputData));
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    // Send audio every 500ms if there's speech
    this.processInterval = setInterval(() => {
      if (audioBuffers.length > 0 && this.ws?.readyState === WebSocket.OPEN && isSpeaking) {
        // Merge all buffers
        const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const buf of audioBuffers) {
          merged.set(buf, offset);
          offset += buf.length;
        }
        audioBuffers.length = 0; // Clear
        isSpeaking = false; // Reset for next interval

        // Convert to WAV and send
        const wavBuffer = this.encodeWAV(merged, this.audioContext!.sampleRate);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(wavBuffer)));
        this.sendSTT(base64);
      }
    }, 500);

    this.isRecording = true;
    console.log("Recording started with ScriptProcessor");
  }

  // Encode PCM data to WAV format
  private encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    this.writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buffer;
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  stopRecording(): void {
    if (!this.isRecording) return;

    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();

    this.stream = null;
    this.audioContext = null;
    this.isRecording = false;
    console.log("Recording stopped");
  }

  sendSTT(audioBase64: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    const message = {
      type: "stt",
      payload: {
        language: "ar",
        isEosEnabled: true,
        eosThreshold: 0.3,
        audioBase64,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendTTS(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    const message = {
      type: "tts",
      payload: {
        text,
        languageId: "ar",
        dialect: "bah", // Bahraini dialect for Jasem
        speaker: "Ruba",
        mulaw: false,
      },
    };

    console.log("Sending TTS request:", message);
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.stopRecording();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
