export type TTSProvider = "bader" | "jasem" | "sara" | "abdullah";

export interface TTSRequest {
  text: string;
  voice_id?: string;
  input_mode?: string;
  performance_id?: string;
  dialect_id?: string;
  provider: TTSProvider;
}

export async function synthesizeSpeech(
  text: string,
  provider: TTSProvider = "bader",
  voiceId?: string
): Promise<Blob> {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const res = await fetch(`${base}/api/tts/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      provider,
      voice_id: voiceId || "1395",
      input_mode: "0",
      performance_id: "206",
      dialect_id: "2",
    } as TTSRequest),
  });

  if (!res.ok) throw new Error("TTS API error");
  return await res.blob();
}

export async function playAudio(audioBlob: Blob, onPlay?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);

    audio.onplay = () => {
      // Call callback when audio actually starts playing
      onPlay?.();
    };

    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio playback failed"));
    };

    audio.play().catch(reject);
  });
}

export async function synthesizeAndPlay(
  text: string,
  provider: TTSProvider = "bader",
  voiceId?: string,
  onPlay?: () => void
): Promise<void> {
  const audioBlob = await synthesizeSpeech(text, provider, voiceId);
  await playAudio(audioBlob, onPlay);
}
