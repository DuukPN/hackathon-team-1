import { useEffect, useState, useRef } from "react";
import { telemetryService, type LapData, type TelemetryData } from "./services/TelemetryService";

const FINISH_LINE_START = { lat: 52.3888, lon: 4.5422 };
const FINISH_LINE_END = { lat: 52.3885, lon: 4.5428 };
const MAX_LAP_BUFFER = 10000; // Circuit breaker to prevent OOM

export type ExtendedLapData = LapData & { telemetry: TelemetryData[] };

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

export function useTelemetry() {
  const [data, setData] = useState<TelemetryData[]>([]);
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const [laps, setLaps] = useState<ExtendedLapData[]>([]);

  const lastFetchTimestamp = useRef<number>(0);
  const isFetching = useRef(false);
  
  const lapCount = useRef(0);
  const bestLapTime = useRef(Infinity);
  const prevPosition = useRef<{ lat: number; lon: number; time: number } | null>(null);
  
  // Timer Refs - Exported to avoid triggering root renders
  const lapStartTime = useRef<number | null>(null);
  const latestDataTime = useRef<number | null>(null);
  const localTimeOfLastUpdate = useRef<number>(Date.now());

  const currentLapPoints = useRef<TelemetryData[]>([]);

  useEffect(() => {
    const fetchTelemetry = async () => {
      if (isFetching.current) return;
      isFetching.current = true;

      try {
        const rawPoints = await telemetryService.getTelemetryData({
          // startTimestamp: 1778774454000,
          // endTimestamp: 1778776254000,
          startTimestamp: lastFetchTimestamp.current,
          endTimestamp: Date.now(),
          limit: 5000, 
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
                  const lapMs = exactCrossingTime - lapStartTime.current;

                  if (lapMs > 10000) { 
                    lapCount.current += 1;
                    const prevBest = bestLapTime.current;
                    
                    if (lapCount.current === 1 || lapMs < bestLapTime.current) {
                      bestLapTime.current = lapMs;
                    }

                    const completedLapData = telemetryService.toLapData(lapCount.current, lapMs, prevBest);
                    setLaps((prevLaps) => [
                      ...prevLaps,
                      {
                        ...completedLapData,
                        telemetry: [...currentLapPoints.current],
                      }
                    ]);

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