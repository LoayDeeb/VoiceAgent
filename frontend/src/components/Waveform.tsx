"use client";
import { useEffect, useRef } from "react";

type Props = {
  height?: number;
  barColor?: string;
  backgroundColor?: string;
};

export default function Waveform({
  height = 64,
  barColor = "#C8102E",
  backgroundColor = "transparent",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let disposed = false;

    async function setup() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set canvas resolution based on device pixel ratio for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512; // Reduced for better performance
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;

        function draw() {
          if (disposed) return;
          const width = rect.width;
          const heightPx = height;

          ctx.fillStyle = backgroundColor;
          ctx.clearRect(0, 0, width, heightPx);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(dataArray);

          const barCount = 60;
          const barWidth = 3;
          const gap = (width - barCount * barWidth) / (barCount + 1);

          for (let i = 0; i < barCount; i++) {
            const idx = Math.floor((i / barCount) * bufferLength);
            let v = dataArray[idx] / 255;

            // Apply logarithmic scaling and boost for better visual response
            v = Math.pow(v, 0.7) * 1.5;
            v = Math.min(v, 1);

            const barHeight = Math.max(3, v * heightPx * 0.9);
            const x = gap + i * (barWidth + gap);
            const y = (heightPx - barHeight) / 2; // Center vertically

            // Create gradient for bars
            const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, barColor + "CC"); // Slightly transparent at bottom

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
          }

          animationRef.current = requestAnimationFrame(draw);
        }

        draw();
      } catch (e) {
        console.error("Waveform error", e);
      }
    }

    setup();

    return () => {
      disposed = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      analyserRef.current?.disconnect();
      audioCtxRef.current?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [barColor, backgroundColor, height]);

  return (
    <canvas
      ref={canvasRef}
      height={height}
      className="w-full block rounded-lg"
      style={{ height: `${height}px` }}
    />
  );
}





