"use client";

import { CameraIcon, WandSparklesIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CameraScannerDialog } from "./camera-scanner-dialog";

type Props = {
  name: string;
  id?: string;
  defaultValue?: string | null;
  /** Server action that returns a freshly generated in-store EAN-13. */
  generate?: () => Promise<string>;
};

export function BarcodeInput({ name, id, defaultValue, generate }: Props) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [scanOpen, setScanOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Input id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Scan, type or generate" className="font-mono" />
      <Button type="button" variant="outline" size="icon" aria-label="Scan with camera" onClick={() => setScanOpen(true)}>
        <CameraIcon />
      </Button>
      {generate ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setValue(await generate());
            })
          }
        >
          <WandSparklesIcon />
          Generate
        </Button>
      ) : null}
      <CameraScannerDialog open={scanOpen} onOpenChange={setScanOpen} onDetected={(code) => setValue(code)} />
    </div>
  );
}
