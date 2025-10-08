export type STTCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (err: Error) => void;
  onState?: (state: "idle" | "listening" | "stopped") => void;
};
// OpenAI STT via backend proxy: we stream mic chunks to /api/stt/transcribe
// For simplicity now, capture a short blob and send as one request on stop.

// Convert WebM blob to WAV using Web Audio API
async function convertToWav(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Convert to mono
  const channelData = audioBuffer.getChannelData(0);
  const wavBuffer = encodeWAV(channelData, audioBuffer.sampleRate);

  return new Blob([wavBuffer], { type: "audio/wav" });
}

// Encode PCM data to WAV format
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function startRecognition(
  _getToken: () => Promise<Record<string, unknown>>,
  callbacks: STTCallbacks = {},
  options: { silenceThreshold?: number; silenceDuration?: number } = {}
) {
  const { silenceThreshold = 0.01, silenceDuration = 1500 } = options;

  console.log("Starting recognition with VAD...");
  callbacks.onState?.("listening");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log("Got media stream");

  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250);
  console.log("Recorder started");

  // Setup VAD (Voice Activity Detection)
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  let silenceStart: number | null = null;
  let hasDetectedSpeech = false;
  let isManualStop = false;
  let vadInterval: NodeJS.Timeout | null = null;

  // Voice activity detection loop
  vadInterval = setInterval(() => {
    analyser.getByteFrequencyData(dataArray);

    // Focus on speech frequencies (85Hz - 3000Hz range)
    // Human voice is typically 85-255Hz (fundamental) with harmonics up to 3kHz
    const lowBin = Math.floor((85 / (audioContext.sampleRate / 2)) * bufferLength);
    const highBin = Math.floor((3000 / (audioContext.sampleRate / 2)) * bufferLength);

    // Calculate energy in speech frequency range
    let speechEnergy = 0;
    for (let i = lowBin; i < highBin; i++) {
      speechEnergy += dataArray[i];
    }
    const average = speechEnergy / (highBin - lowBin) / 255;

    // Also check for spectral flux (change in frequency content)
    // Speech has more variation than static noise
    const variance = dataArray.slice(lowBin, highBin).reduce((sum, val, i, arr) => {
      const mean = average * 255;
      return sum + Math.pow(val - mean, 2);
    }, 0) / (highBin - lowBin);

    const hasVariance = variance > 1000; // Speech has frequency variation

    if (average > silenceThreshold && hasVariance) {
      // Speech detected (has both energy and frequency variation)
      if (!hasDetectedSpeech) {
        console.log("Speech detected! Energy:", average.toFixed(3), "Variance:", variance.toFixed(0));
      }
      hasDetectedSpeech = true;
      silenceStart = null;
    } else if (hasDetectedSpeech && silenceStart === null) {
      // Silence started after speech
      console.log("Silence started after speech");
      silenceStart = Date.now();
    } else if (silenceStart && Date.now() - silenceStart > silenceDuration) {
      // Silence duration exceeded - auto stop
      console.log("Silence duration exceeded, auto-stopping...");
      if (!isManualStop && hasDetectedSpeech) {
        if (vadInterval) clearInterval(vadInterval);
        stopRecording();
      }
    }
  }, 100);

  console.log("VAD monitoring started");

  const stopRecording = async () => {
    console.log("stopRecording called, chunks:", chunks.length, "hasDetectedSpeech:", hasDetectedSpeech);
    recorder.stop();
    if (vadInterval) clearInterval(vadInterval);

    recorder.onstop = async () => {
      console.log("Recorder stopped, processing audio...");
      try {
        // Only process if we have meaningful audio
        if (chunks.length === 0 || !hasDetectedSpeech) {
          console.log("No speech detected, skipping transcription");
          callbacks.onError?.(new Error("No speech detected"));
          return;
        }

        console.log("Converting audio to WAV...");
        const webmBlob = new Blob(chunks, { type: "audio/webm" });

        // Convert to WAV
        const wavBlob = await convertToWav(webmBlob);
        console.log("Sending to backend for transcription...");

        const form = new FormData();
        form.append("audio", wavBlob, "recording.wav");
        form.append("prompt", "Conversation transcription for banking assistant.");

        const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
        const res = await fetch(`${base}/api/stt/transcribe`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("STT transcribe failed");
        const data = (await res.json()) as { text: string };
        if (data.text) callbacks.onFinal?.(data.text);
      } catch (e) {
        callbacks.onError?.(e as Error);
      } finally {
        stream.getTracks().forEach((t) => t.stop());
        audioContext.close();
        callbacks.onState?.("stopped");
      }
    };
  };

  // Return manual stop function
  return () => {
    isManualStop = true;
    if (vadInterval) clearInterval(vadInterval);
    stopRecording();
  };
}


