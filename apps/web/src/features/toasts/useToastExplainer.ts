import React from "react";
import { toast } from "sonner";
import { type VisualizerEvent } from "@jsv/protocol";

export function useToastExplainer(lastEvent: VisualizerEvent | null) {
  React.useEffect(() => {
    if (!lastEvent) return;

    // We can add logic here to only toast on specific important events
    // or if the user has enabled "verbose" mode.
    // For now, let's keep it simple or migrate the logic from main if any existed.
    // Checking main.tsx...
    // It seems main.tsx was using `scheduleEvent` which called `toast.success`.
    // And `handleScheduleTask` used toasts.
    // But there wasn't a dedicated effect *observing* events to toast them,
    // except maybe for errors?

    if (lastEvent.type === "RUNTIME_ERROR") {
      toast.error(`Runtime Error: ${lastEvent.message}`);
    }
  }, [lastEvent]);
}
