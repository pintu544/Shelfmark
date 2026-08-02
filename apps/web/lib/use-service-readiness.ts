"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  isWakeableError,
  messageFromError,
  wakeApi,
} from "@/lib/api";

export type ServiceState = "checking" | "waking" | "ready" | "unavailable";

export function useServiceReadiness() {
  const [state, setState] = useState<ServiceState>("checking");
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("checking");
    setError("");

    try {
      await api.health(controller.signal);
      if (!controller.signal.aborted) setState("ready");
    } catch (initialError) {
      if (controller.signal.aborted) return;
      if (!isWakeableError(initialError)) {
        setState("unavailable");
        setError(messageFromError(initialError));
        return;
      }

      setState("waking");
      try {
        await wakeApi(controller.signal);
        if (!controller.signal.aborted) setState("ready");
      } catch (wakeError) {
        if (controller.signal.aborted) return;
        setState("unavailable");
        setError(
          messageFromError(
            wakeError,
            "The library service is taking longer than expected to wake.",
          ),
        );
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void check(), 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [check]);

  return { state, error, retry: check };
}
