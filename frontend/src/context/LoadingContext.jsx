import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TruckLoaderOverlay } from "../components/TruckLoader";
import NavigationSplash from "../components/NavigationSplash";

const LoadingContext = createContext(null);

const PLANNING_MESSAGES = [
  "Analyzing available freight corridors...",
  "Checking weather checkpoints...",
  "Evaluating HGV risk conditions...",
  "Comparing route alternatives...",
];

export function LoadingProvider({
  children,
  isAppReady = true,
  enableInitialSplash = true,
  splashMinMs = 3200,
  splashSlideMs = 600,
  splashSafetyTimeoutMs = 11000,
  minPlanningMs = 2000,
}) {
  const [minElapsed, setMinElapsed] = useState(!enableInitialSplash);
  const [safetyReady, setSafetyReady] = useState(!enableInitialSplash);
  const [splashStage, setSplashStage] = useState(0);
  const [splashPhase, setSplashPhase] = useState(
    enableInitialSplash ? "visible" : "done"
  );
  const exitStartedRef = useRef(false);

  const [planLoading, setPlanLoading] = useState({
    active: false,
    stepIndex: 0,
  });

  // Initial website splash timing (never delays API fetching; runs once on first load)
  useEffect(() => {
    if (!enableInitialSplash) return undefined;

    const stageOneTimer = setTimeout(
      () => setSplashStage(1),
      Math.round(splashMinMs * 0.34)
    );
    const stageTwoTimer = setTimeout(
      () => setSplashStage(2),
      Math.round(splashMinMs * 0.68)
    );
    const minTimer = setTimeout(() => {
      setMinElapsed(true);
    }, splashMinMs);
    const safetyTimer = setTimeout(() => {
      setSafetyReady(true);
    }, splashSafetyTimeoutMs);

    return () => {
      clearTimeout(stageOneTimer);
      clearTimeout(stageTwoTimer);
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
    };
  }, [enableInitialSplash, splashMinMs, splashSafetyTimeoutMs]);

  useEffect(() => {
    if (!enableInitialSplash || exitStartedRef.current) return undefined;
    if (!minElapsed || (!isAppReady && !safetyReady)) return undefined;

    exitStartedRef.current = true;
    setSplashStage(2);
    setSplashPhase("exiting");
    return undefined;
  }, [enableInitialSplash, minElapsed, isAppReady, safetyReady]);

  useEffect(() => {
    if (splashPhase !== "exiting") return undefined;

    const doneTimer = setTimeout(() => {
      setSplashPhase("done");
    }, splashSlideMs);

    return () => clearTimeout(doneTimer);
  }, [splashPhase, splashSlideMs]);

  useEffect(() => {
    if (!planLoading.active) return undefined;
    const cycle = setInterval(() => {
      setPlanLoading((prev) => ({
        ...prev,
        stepIndex: (prev.stepIndex + 1) % PLANNING_MESSAGES.length,
      }));
    }, 650);
    return () => clearInterval(cycle);
  }, [planLoading.active]);

  const runWithPlanningLoader = useCallback(
    async (taskFn) => {
      setPlanLoading({ active: true, stepIndex: 0 });

      const startedAt = Date.now();
      let result;
      let caughtError = null;

      try {
        result = await taskFn();
      } catch (err) {
        caughtError = err;
      }

      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, minPlanningMs - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      setPlanLoading({ active: false, stepIndex: 0 });

      if (caughtError) {
        throw caughtError;
      }
      return result;
    },
    [minPlanningMs]
  );

  return (
    <LoadingContext.Provider
      value={{
        isSplashActive: splashPhase !== "done",
        isPlanning: planLoading.active,
        runWithPlanningLoader,
      }}
    >
      {children}
      <NavigationSplash phase={splashPhase} stageIndex={splashStage} />
      <TruckLoaderOverlay
        active={planLoading.active}
        message={PLANNING_MESSAGES[planLoading.stepIndex]}
        subtitle="Fetching HGV corridors and ETA weather forecasts"
      />
    </LoadingContext.Provider>
  );
}

export function useLoadingContext() {
  return useContext(LoadingContext);
}
