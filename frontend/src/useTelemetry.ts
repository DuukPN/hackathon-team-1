import { useEffect, useState, useRef } from "react";
import { telemetryService, type LapData, type TelemetryData } from "./services/TelemetryService";

// Coordinate boundary for the Zandvoort Start/Finish line
const FINISH_LINE_START = { lat: 52.3888, lon: 4.5422 };
const FINISH_LINE_END = { lat: 52.3885, lon: 4.5428 };
const ATHENA_LOOKBACK_MS = 2 * 1000;

// Zandvoort approximate racing line points (Adjusted for better accuracy)
const CIRCUIT_POINTS = [
  { lat: 52.3888, lon: 4.5422 }, // Start/Finish
  { lat: 52.3865, lon: 4.5424 }, // Straight
  { lat: 52.3846, lon: 4.5426 }, // Tarzanbocht
  { lat: 52.3837, lon: 4.5447 }, // Gerlachbocht
  { lat: 52.3828, lon: 4.5458 }, // Hugenholtzbocht
  { lat: 52.3822, lon: 4.5435 }, // Hunserug
  { lat: 52.3824, lon: 4.5401 }, // Rob Slotemakerbocht
  { lat: 52.3831, lon: 4.5367 }, // Scheivlak
  { lat: 52.3841, lon: 4.5348 }, // Mastersbocht
  { lat: 52.3854, lon: 4.5350 }, // Bocht 9
  { lat: 52.3866, lon: 4.5368 }, // Bocht 10
  { lat: 52.3878, lon: 4.5375 }, // Hans Ernst Bocht
  { lat: 52.3891, lon: 4.5385 }, // Kumhobocht
  { lat: 52.3895, lon: 4.5408 }, // Arie Luyendykbocht
  { lat: 52.3888, lon: 4.5422 }, // Start/Finish (loop closure)
];

// Helper function: Checks if two line segments intersect
// P0-P1 is the car's movement segment
// P2-P3 is the Finish line segment
function checkLineIntersection(
  p0_x: number, p0_y: number, p1_x: number, p1_y: number,
  p2_x: number, p2_y: number, p3_x: number, p3_y: number
) {
  const s1_x = p1_x - p0_x, s1_y = p1_y - p0_y;
  const s2_x = p3_x - p2_x, s2_y = p3_y - p2_y;

  const denominator = (-s2_x * s1_y + s1_x * s2_y);
  if (denominator === 0) return false; // collinear

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denominator;
  const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denominator;

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

export function useTelemetry() {
  const [data, setData] = useState<TelemetryData[]>([]);
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const [laps, setLaps] = useState<LapData[]>([]);
  const [currentLapTime, setCurrentLapTime] = useState(0);

  // References to keep state across intervals without closure issues
  const lapCount = useRef(0);
  const bestLapTime = useRef(Infinity);
  const prevPosition = useRef<{ lat: number, lon: number } | null>(null);
  const lapStartTime = useRef<number>(Date.now());
  const circuitProgress = useRef(0);
  const isFetchingTelemetry = useRef(false);

  useEffect(() => {
    let t = 0;
    
    // Updates UI timer cleanly
    const clockInterval = setInterval(() => {
       setCurrentLapTime(Date.now() - lapStartTime.current);
    }, 100);

    const dataInterval = setInterval(async () => {
      let currentData: TelemetryData | null = null;
      if (!isFetchingTelemetry.current) {
        try {
          isFetchingTelemetry.current = true;
          currentData = await telemetryService.getLatestTelemetryData({
            startTimestamp: Date.now() - ATHENA_LOOKBACK_MS,
            endTimestamp: Date.now(),
            limit: 1000,
          });
        } catch (e) {
          // Ignored
        } finally {
          isFetchingTelemetry.current = false;
        }
      }

      // If no valid data returned, generate mock data mimicking loop movements
      if (!currentData) {
         t += 0.1;

         // Simulate driving around the circuit (FASTER: ~10 seconds per lap!)
         circuitProgress.current += 0.01; 
         if (circuitProgress.current >= 1) {
           circuitProgress.current -= 1;
         }

         // Interpolate between CIRCUIT_POINTS
         const totalSegments = CIRCUIT_POINTS.length - 1;
         const scaledProgress = circuitProgress.current * totalSegments;
         const segmentIndex = Math.floor(scaledProgress);
         const segmentProgress = scaledProgress - segmentIndex;

         const pA = CIRCUIT_POINTS[segmentIndex];
         const pB = CIRCUIT_POINTS[segmentIndex + 1] || CIRCUIT_POINTS[0];

         const mockLat = pA.lat + (pB.lat - pA.lat) * segmentProgress;
         const mockLon = pA.lon + (pB.lon - pA.lon) * segmentProgress;

         currentData = {
           timestamp: new Date().toISOString(),
           latitude: mockLat,
           longitude: mockLon,
           speed: Math.max(0, 150 + 80 * Math.sin(circuitProgress.current * Math.PI * 10) + Math.random() * 5),
           acc_x: Math.sin(t * 2) * 1.5 + (Math.random() - 0.5) * 0.5,
           acc_y: Math.cos(t) * 1.5 + (Math.random() - 0.5) * 0.5,
         };
      }

      // Crossing Detection Logic
      if (prevPosition.current) {
        // Real tracking: math intersection between points
        const crossedReal = checkLineIntersection(
          prevPosition.current.lat, prevPosition.current.lon,
          currentData.latitude, currentData.longitude,
          FINISH_LINE_START.lat, FINISH_LINE_START.lon,
          FINISH_LINE_END.lat, FINISH_LINE_END.lon
        );

        if (crossedReal) {
          const now = Date.now();
          const currentLapMs = now - lapStartTime.current;
          
          // Debounce safeguard: Ignore crossings that are less than 5 seconds apart
          if (currentLapMs > 5000) {
            lapCount.current += 1;

            const previousBestLapTime = bestLapTime.current;
            if (lapCount.current === 1 || currentLapMs < bestLapTime.current) {
              bestLapTime.current = currentLapMs;
            }

            setLaps(prev => [
              ...prev,
              telemetryService.toLapData(lapCount.current, currentLapMs, previousBestLapTime),
            ]);

            // Reset start time to measure the next lap
            lapStartTime.current = now;
          }
        }
      }

      // Store previous position for the next iteration
      prevPosition.current = { lat: currentData.latitude, lon: currentData.longitude };

      setLatest(currentData);
      setData((prev) => {
        const next = [...prev, currentData!];
        // Increase saved datapoints to draw a longer line/map curve if desired
        return next.length > 100 ? next.slice(next.length - 100) : next;
      });

    }, 5000);

    return () => {
       clearInterval(dataInterval);
       clearInterval(clockInterval);
    };
  }, []);

  return { data, latest, laps, currentLapTime };
}
