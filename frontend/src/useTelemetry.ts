import { useEffect, useState, useRef } from "react";
import { telemetryService, type LapData, type TelemetryData } from "./services/TelemetryService";

const FINISH_LINE_START = { lat: 52.3888, lon: 4.5422 };
const FINISH_LINE_END = { lat: 52.3885, lon: 4.5428 };

function checkLineIntersection(
  p0_x: number, p0_y: number, p1_x: number, p1_y: number,
  p2_x: number, p2_y: number, p3_x: number, p3_y: number
) {
  const s1_x = p1_x - p0_x, s1_y = p1_y - p0_y;
  const s2_x = p3_x - p2_x, s2_y = p3_y - p2_y;

  const denominator = (-s2_x * s1_y + s1_x * s2_y);
  if (denominator === 0) return false;

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denominator;
  const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denominator;

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

export function useTelemetry() {
  const [data, setData] = useState<TelemetryData[]>([]);
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const [laps, setLaps] = useState<LapData[]>([]);
  const [currentLapTime, setCurrentLapTime] = useState(0);

  const lastFetchTimestamp = useRef<number>(0);
  const isFetching = useRef(false);
  
  const lapCount = useRef(0);
  const bestLapTime = useRef(Infinity);
  const prevPosition = useRef<{ lat: number; lon: number } | null>(null);
  const lapStartTime = useRef<number | null>(null);

  useEffect(() => {
    const fetchTelemetry = async () => {
      if (isFetching.current) return;
      isFetching.current = true;

      try {
        const newPoints = await telemetryService.getTelemetryData({
          startTimestamp: Date.now() - 2 * 1000, // Fetch last 5 minutes of data to ensure we capture any missed points
          endTimestamp: Date.now(),
          limit: 5000, 
        });

        if (newPoints.length > 0) {
          lastFetchTimestamp.current = new Date(newPoints[newPoints.length - 1].timestamp).getTime() + 1;

          setData((prev) => {
            const combined = [...prev, ...newPoints];
            return combined.slice(-5000); // Prevent memory leaks by maintaining a rolling window
          });
          
          setLatest(newPoints[newPoints.length - 1]);

          newPoints.forEach((point) => {
            const ptTime = new Date(point.timestamp).getTime();
            if (!lapStartTime.current) lapStartTime.current = ptTime;

            if (prevPosition.current) {
              const crossed = checkLineIntersection(
                prevPosition.current.lat,
                prevPosition.current.lon,
                point.latitude,
                point.longitude,
                FINISH_LINE_START.lat,
                FINISH_LINE_START.lon,
                FINISH_LINE_END.lat,
                FINISH_LINE_END.lon
              );

              if (crossed) {
                const lapMs = ptTime - lapStartTime.current;
                // Debounce threshold (5 seconds) to prevent false multiple triggers on the line
                if (lapMs > 5000) {
                  lapCount.current += 1;
                  const prevBest = bestLapTime.current;
                  if (lapCount.current === 1 || lapMs < bestLapTime.current) {
                    bestLapTime.current = lapMs;
                  }

                  setLaps((prevLaps) => [
                    ...prevLaps,
                    telemetryService.toLapData(lapCount.current, lapMs, prevBest),
                  ]);

                  lapStartTime.current = ptTime;
                }
              }
            }
            prevPosition.current = { lat: point.latitude, lon: point.longitude };
          });

          // Calculate current ongoing lap time relative to the most recently fetched data point
          if (lapStartTime.current) {
            const latestPtTime = new Date(newPoints[newPoints.length - 1].timestamp).getTime();
            setCurrentLapTime(Math.max(0, latestPtTime - lapStartTime.current));
          }
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

  return { data, latest, laps, currentLapTime };
}