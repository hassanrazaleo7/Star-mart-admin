"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
  /** Close automatically after the first successful read (default true). */
  closeOnDetect?: boolean;
};

type Controls = { stop: () => void };
type ScanError = { attempt: number; message: string };

/** Camera barcode scanner using the pure-JS ZXing decoder (no WASM, CSP stays strict). */
export function CameraScannerDialog({ open, onOpenChange, onDetected, closeOnDetect = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [error, setError] = useState<ScanError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const handleDetected = useEffectEvent((code: string) => {
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 1500) return;
    lastRef.current = { code, at: now };
    beep();
    onDetected(code);
    if (closeOnDetect) onOpenChange(false);
  });
  const handleError = useEffectEvent((message: string) => setError({ attempt, message }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let controls: Controls | null = null;
    let videoEl: HTMLVideoElement | null = null;
    // The dialog body mounts a tick after `open` flips, so the <video> may not
    // exist when this effect runs; poll briefly instead of capturing a null ref.
    const waitForVideo = async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        if (videoRef.current) return videoRef.current;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    };

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        const video = await waitForVideo();
        if (cancelled || !video) return;
        videoEl = video;
        const started = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (result) handleDetected(result.getText());
        });
        if (cancelled) {
          started.stop();
          return;
        }
        controls = started;
      } catch (err) {
        const name = (err as { name?: string })?.name;
        handleError(
          name === "NotAllowedError"
            ? "Camera access was denied. Allow the camera for this site and try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "Could not start the camera scanner.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
      const video = videoEl;
      if (video?.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    };
  }, [open, attempt]);

  const visibleError = error && error.attempt === attempt ? error.message : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan barcode</DialogTitle>
          <DialogDescription>Point the camera at the barcode. It is read automatically.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" autoPlay muted playsInline />
        </div>
        {visibleError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{visibleError}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function beep() {
  try {
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {
    /* audio is optional */
  }
}
