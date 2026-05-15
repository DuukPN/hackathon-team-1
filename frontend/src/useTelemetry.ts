import { useEffect, useState, useRef } from "react";
import { telemetryService, type LapData, type TelemetryData } from "./services/TelemetryService";

const FINISH_LINE_START = { lat: 52.3888, lon: 4.5422 };
const FINISH_LINE_END = { lat: 52.3885, lon: 4.5428 };
const MAX_LAP_BUFFER = 10000; // Circuit breaker to prevent OOM
const LAP_STORAGE_KEY = "team-1-laps";
const EMPTY_STORAGE_RECOMPUTE_LOOKBACK_MS = 30 * 60 * 1000;

export type StoredLapData = LapData & {
  sessionId: number;
  startTimestamp: number;
  endTimestamp: number;
};

export type ExtendedLapData = StoredLapData & { telemetry: TelemetryData[] };

export type TimerRefs = {
  lapStartTime: React.MutableRefObject<number | null>;
  latestDataTime: React.MutableRefObject<number | null>;
  localTimeOfLastUpdate: React.MutableRefObject<number>;
};

function getIntersectionFraction(
  p0_x: number, p0_y: number, p1_x: number, p1_y: number,
  p2_x: number, p2_y: number, p3_x: number, p3_y: number
): number {
  const s1_x = p1_x - p0_x, s1_y = p1_y - p0_y;
  const s2_x = p3_x - p2_x, s2_y = p3_y - p2_y;

  const denominator = (-s2_x * s1_y + s1_x * s2_y);
  if (denominator === 0) return -1;

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denominator;
  const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denominator;

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) return s;
  return -1;
}

function isStoredLapData(value: unknown): value is StoredLapData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const lap = value as Record<string, unknown>;
  return (
    typeof lap.id === "number" &&
    typeof lap.time === "string" &&
    typeof lap.timeMs === "number" &&
    typeof lap.diff === "string" &&
    typeof lap.status === "string" &&
    typeof lap.sessionId === "number" &&
    typeof lap.startTimestamp === "number" &&
    typeof lap.endTimestamp === "number"
  );
}

function loadStoredLaps(): StoredLapData[] {
  try {
    const raw = window.localStorage.getItem(LAP_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isStoredLapData);
  } catch (error) {
    console.warn("Failed to load saved laps from localStorage", error);
    return [];
  }
}

function saveStoredLaps(laps: StoredLapData[]): void {
  try {
    window.localStorage.setItem(LAP_STORAGE_KEY, JSON.stringify(laps));
  } catch (error) {
    console.warn("Failed to save laps to localStorage", error);
  }
}

function getConfiguredSessionId(): number | undefined {
  const value = import.meta.env.VITE_SESSION_ID;
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn("Ignoring invalid VITE_SESSION_ID. Expected a positive integer.");
    return undefined;
  }

  return parsed;
}

export function useTelemetry() {
  const configuredSessionId = useRef<number | undefined>(getConfiguredSessionId()).current;
  const initialStoredLaps = useRef<StoredLapData[]>(
    loadStoredLaps().filter((lap) => configuredSessionId === undefined || lap.sessionId === configuredSessionId),
  ).current;
  const [data, setData] = useState<TelemetryData[]>([]);
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const [laps, setLaps] = useState<ExtendedLapData[]>(() =>
    initialStoredLaps.map((lap) => ({ ...lap, telemetry: [] })),
  );

  const storedLaps = useRef<StoredLapData[]>(initialStoredLaps);
  const lastSavedLap = storedLaps.current.at(-1);
  const sessionIdFilter = configuredSessionId ?? lastSavedLap?.sessionId;
  const lastFetchTimestamp = useRef<number>(
    lastSavedLap?.endTimestamp ?? Date.now() - EMPTY_STORAGE_RECOMPUTE_LOOKBACK_MS,
  );
  const isFetching = useRef(false);
  
  const lapCount = useRef(lastSavedLap?.id ?? 0);
  const bestLapTime = useRef(
    storedLaps.current.reduce((best, lap) => Math.min(best, lap.timeMs), Infinity),
  );
  const prevPosition = useRef<{ lat: number; lon: number; time: number } | null>(null);
  
  // Timer Refs - Exported to avoid triggering root renders
  const lapStartTime = useRef<number | null>(lastSavedLap?.endTimestamp ?? null);
  const latestDataTime = useRef<number | null>(null);
  const localTimeOfLastUpdate = useRef<number>(Date.now());

  const currentLapPoints = useRef<TelemetryData[]>([]);
  const currentSessionId = useRef<number | null>(lastSavedLap?.sessionId ?? null);

  const appendCompletedLap = (lap: ExtendedLapData) => {
    setLaps((prevLaps) => {
      const alreadySaved = prevLaps.some(
        (existingLap) =>
          existingLap.sessionId === lap.sessionId &&
          existingLap.startTimestamp === lap.startTimestamp &&
          existingLap.endTimestamp === lap.endTimestamp,
      );

      if (alreadySaved) return prevLaps;

      const nextLaps = [...prevLaps, lap];
      const nextStoredLaps = nextLaps.map(({ telemetry: _telemetry, ...storedLap }) => storedLap);
      const persistedSessionId = configuredSessionId ?? lap.sessionId;
      const otherStoredLaps = loadStoredLaps().filter((storedLap) => storedLap.sessionId !== persistedSessionId);

      storedLaps.current = nextStoredLaps;
      saveStoredLaps([...otherStoredLaps, ...nextStoredLaps]);
      return nextLaps;
    });
  };

  useEffect(() => {
    const fetchTelemetry = async () => {
      if (isFetching.current) return;
      isFetching.current = true;

      try {
        const rawPoints = await telemetryService.getTelemetryData({
          startTimestamp: lastFetchTimestamp.current,
          endTimestamp: Date.now(),
          limit: 10000, 
          sessionId: sessionIdFilter,
        });

        if (rawPoints.length > 0) {
          lastFetchTimestamp.current = rawPoints[rawPoints.length - 1].timestamp + 1;

          setData((prev) => {
            const combined = [...prev, ...rawPoints];
            return combined.slice(-5000); 
          });
          
          const latestPoint = rawPoints[rawPoints.length - 1];
          setLatest(latestPoint);

          latestDataTime.current = latestPoint.timestamp;
          localTimeOfLastUpdate.current = Date.now();

          rawPoints.forEach((point) => {
            if (currentSessionId.current === null) {
              currentSessionId.current = point.session_id;
            }

            if (!lapStartTime.current) lapStartTime.current = point.timestamp;

            if (point.latitude !== 0 && point.longitude !== 0) {
              if (currentLapPoints.current.length < MAX_LAP_BUFFER) {
                currentLapPoints.current.push(point);
              }

              if (prevPosition.current) {
                const fraction = getIntersectionFraction(
                  prevPosition.current.lat, prevPosition.current.lon,
                  point.latitude, point.longitude,
                  FINISH_LINE_START.lat, FINISH_LINE_START.lon,
                  FINISH_LINE_END.lat, FINISH_LINE_END.lon
                );

                if (fraction >= 0) {
                  const exactCrossingTime = prevPosition.current.time + (fraction * (point.timestamp - prevPosition.current.time));
                  const lapEndTimestamp = Math.round(exactCrossingTime);
                  const lapStartTimestamp = Math.round(lapStartTime.current);
                  const lapMs = exactCrossingTime - lapStartTime.current;

                  if (lapMs > 10000) { 
                    lapCount.current += 1;
                    const prevBest = bestLapTime.current;
                    
                    if (lapCount.current === 1 || lapMs < bestLapTime.current) {
                      bestLapTime.current = lapMs;
                    }

                    const completedLapData = telemetryService.toLapData(lapCount.current, lapMs, prevBest);
                    appendCompletedLap({
                      ...completedLapData,
                      sessionId: currentSessionId.current,
                      startTimestamp: lapStartTimestamp,
                      endTimestamp: lapEndTimestamp,
                      telemetry: [...currentLapPoints.current],
                    });

                    lapStartTime.current = exactCrossingTime;
                    currentLapPoints.current = [point]; 
                  }
                }
              }
              prevPosition.current = { lat: point.latitude, lon: point.longitude, time: point.timestamp };
            }
          });
        }
      } catch (e) {
        console.error("Telemetry fetch execution failed:", e);
      } finally {
        isFetching.current = false;
      }
    };

    fetchTelemetry();
    const intervalId = setInterval(fetchTelemetry, 2000);

    return () => clearInterval(intervalId);
  }, []);

  return { 
    data, 
    latest, 
    laps, 
    timerRefs: { lapStartTime, latestDataTime, localTimeOfLastUpdate } 
  };
}
