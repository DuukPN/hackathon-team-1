import { useMemo, useState, useEffect } from "react";
import { useTelemetry, type TimerRefs } from "./useTelemetry";
import { MapContainer, TileLayer, CircleMarker, Polyline } from "react-leaflet";
import L from "leaflet";
import { TelemetryPage } from "./TelemetryPage";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const ZANDVOORT_CENTER: [number, number] = [52.3880, 4.5440];

// Isolated component to prevent main thread blocking
function LapTimer({ timerRefs }: { timerRefs: TimerRefs }) {
  const [currentLapTime, setCurrentLapTime] = useState(0);

  useEffect(() => {
    const timerId = setInterval(() => {
      if (timerRefs.lapStartTime.current && timerRefs.latestDataTime.current) {
        const localElapsed = Date.now() - timerRefs.localTimeOfLastUpdate.current;
        setCurrentLapTime((timerRefs.latestDataTime.current - timerRefs.lapStartTime.current) + localElapsed);
      }
    }, 50);
    return () => clearInterval(timerId);
  }, [timerRefs]);

  const currentLapMins = Math.floor(currentLapTime / 60000);
  const currentLapSecs = ((currentLapTime % 60000) / 1000).toFixed(2).padStart(5, "0");

  return <div className="text-3xl font-bold">{currentLapMins}:{currentLapSecs}</div>;
}

export function App() {
  if (window.location.pathname === "/telemetry") {
    return <TelemetryPage />;
  }

  const { data, latest, laps, timerRefs } = useTelemetry();
  const [selectedLapId, setSelectedLapId] = useState<number | null>(null);

  // Memoize heavy array operations to decouple from arbitrary renders
  const { pathPositions, lastValidGps } = useMemo(() => {
    const positions: [number, number][] = [];
    let lastValid = null;
    for (let i = 0; i < data.length; i++) {
      if (data[i].latitude !== 0 && data[i].longitude !== 0) {
        positions.push([data[i].latitude, data[i].longitude]);
        lastValid = data[i];
      }
    }
    return { pathPositions: positions, lastValidGps: lastValid };
  }, [data]);

  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    const sessionStartTime = data[0].timestamp;
    const latestTimestamp = data[data.length - 1].timestamp;
    const ninetySecondsAgo = latestTimestamp - 120000;

    return data
      .filter((d) => d.timestamp >= ninetySecondsAgo)
      .map((d) => ({
        time: ((d.timestamp - sessionStartTime) / 1000).toFixed(1),
        speed: d.speed,
      }));
  }, [data]);

  const gForceTrail = useMemo(() => data, [data]);
  // const gForceTrail = useMemo(() => data.slice(-150), [data]);

  const lat = lastValidGps?.latitude;
  const lon = lastValidGps?.longitude;

  return (
    <div className="min-h-screen p-6 pb-28 bg-[#003530] text-white font-mono flex flex-col items-center gap-8">
      
      <div className="flex justify-between items-center w-full max-w-[1400px]">
        <div className="flex items-center gap-4">
          <img src="/assets/LogowhiteBig.svg" alt="Synadia" className="h-8" />
        </div>
        <a
          href="/telemetry"
          className="rounded border border-[#35fdad] px-4 py-2 text-sm font-semibold text-[#35fdad] transition hover:bg-[#35fdad] hover:text-[#003530]"
        >
          Telemetry data
        </a>
      </div>

      <div className="flex gap-8 h-[550px] w-full max-w-[1400px] justify-center">
        
        <div className="w-[550px] h-full shrink-0 border-2 border-[#35fdad] rounded-md bg-black relative overflow-hidden flex flex-col shadow-lg shadow-black/50">
          <div className="w-full h-full relative" style={{ isolation: "isolate" }}>
            <MapContainer
              center={ZANDVOORT_CENTER}
              zoom={15}
              scrollWheelZoom={true}
              zoomControl={false}
              style={{ height: "100%", width: "100%", zIndex: 0 }}
            >
              <TileLayer
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
              {pathPositions.length > 0 && (
                <Polyline positions={pathPositions} color="#35fdad" weight={4} opacity={0.8} />
              )}
              {lat && lon && (
                <CircleMarker 
                  center={[lat, lon]} 
                  radius={7} 
                  pathOptions={{ color: '#003530', weight: 2, fillColor: '#35fdad', fillOpacity: 1 }} 
                />
              )}
            </MapContainer>
          </div>
        </div>

        <div className="w-[360px] h-full shrink-0 border border-white rounded-md p-6 bg-black flex flex-col items-center justify-center relative shadow-lg shadow-black/50">
          <h2 className="absolute top-4 left-4 text-[#35fdad] font-bold text-lg">G-Force</h2>
          <div className="w-[300px] h-[300px] relative rounded-full overflow-hidden bg-[#0a0a0a] mt-4">
            <div className="absolute w-full h-[1px] bg-gray-700 top-1/2 left-0" />
            <div className="absolute w-[1px] h-full bg-gray-700 left-1/2 top-0" />
            <div className="absolute w-[33.33%] h-[33.33%] border border-gray-600 rounded-full top-[33.33%] left-[33.33%]" />
            <div className="absolute w-[66.66%] h-[66.66%] border border-gray-600 rounded-full top-[16.66%] left-[16.66%]" />
            <div className="absolute w-full h-full border border-gray-500 rounded-full top-0 left-0" />
            
            <span className="absolute text-[12px] text-gray-400 top-[16.66%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0a] px-1 z-0">2G</span>
            <span className="absolute text-[12px] text-gray-400 top-[33.33%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0a] px-1 z-0">1G</span>

            {gForceTrail.map((d, i, arr) => {
              const gx = (d.acc_x || 0) / 9.81;
              const gy = (d.acc_y || 0) / 9.81;
              const dotLeft = Math.max(0, Math.min(100, 50 + (gx / 3) * 50));
              const dotTop = Math.max(0, Math.min(100, 50 + (gy / 3) * 50));
              const isLatest = i === arr.length - 1;
              
              return (
                <div
                  key={`${d.timestamp}-${i}`}
                  className={`absolute rounded-full transform -translate-x-1/2 -translate-y-1/2 ${
                    isLatest 
                      ? "w-5 h-5 bg-[#f94df9] z-20 shadow-[0_0_10px_#f94df9]" 
                      : "w-[8px] h-[8px] bg-[#35fdad] opacity-40 z-10"
                  }`}
                  style={{
                    left: `${dotLeft}%`,
                    top: `${dotTop}%`,
                    transition: isLatest ? "all 0.1s ease-out" : "none"
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="w-[400px] h-full shrink-0 border border-white rounded-md p-6 bg-black flex flex-col overflow-hidden shadow-lg shadow-black/50">
          <h2 className="text-[#35fdad] font-bold text-lg mb-5">Lap Times</h2>
          
          <div className="border border-gray-700 rounded-md p-4 bg-[#111] mb-5 shrink-0 flex justify-between items-center">
            <div className="text-sm text-gray-400 uppercase tracking-wider">Current Lap</div>
            <LapTimer timerRefs={timerRefs} />
          </div>
          
          <div className="flex flex-col gap-4 overflow-y-auto pr-3 h-full" style={{ scrollbarWidth: 'thin' }}>
            {[...laps].reverse().map(lap => {
              let timeColor = "text-white";
              let diffColor = "text-gray-400";
              if (lap.status === "fastest") {
                timeColor = "text-[#f94df9]";
                diffColor = "text-[#f94df9]";
              } else if (lap.status === "worse") {
                diffColor = "text-orange-500";
              }

              return (
                <div key={lap.id} className="flex justify-between items-center border-b border-gray-800 pb-3 last:border-0 shrink-0">
                  <div className="text-base text-gray-500 w-20">Lap {lap.id}</div>
                  <div className={`text-2xl font-sans font-bold flex-grow text-center ${timeColor}`}>{lap.time}</div>
                  <div className={`text-base font-mono ${diffColor} w-24 text-right`}>{lap.diff}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <div className="border border-white rounded-md p-6 bg-black w-full max-w-[1400px] h-[300px] flex flex-col relative shrink-0 shadow-lg shadow-black/50">
        <h2 className="absolute top-4 left-6 text-[#35fdad] text-lg font-bold z-10 w-full">
          Speed Trace (Last 1.5 Min)
          {latest && <span className="ml-5 text-white text-2xl font-bold">{latest.speed.toFixed(0)} km/h</span>}
        </h2>
        <div className="w-full h-full mt-8 flex-grow pb-2 z-10 text-sm">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis 
                dataKey="time" 
                stroke="#666" 
                tick={{ fill: '#666', fontSize: 12 }}
                tickFormatter={(val) => `${val}s`}
                minTickGap={40}
              />
              <YAxis domain={[0, 'auto']} stroke="#ccc" tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: "#111", border: "1px solid #35fdad", fontSize: '14px' }}
                itemStyle={{ color: "#35fdad" }}
                labelStyle={{ display: "none" }}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#35fdad"
                strokeWidth={3}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {laps.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[1000] border-t border-[#35fdad]/60 bg-black/95 px-6 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 overflow-x-auto">
            <div className="shrink-0 text-sm font-bold uppercase tracking-wider text-[#35fdad]">Laps</div>
            {[...laps].reverse().map((lap) => {
              const isSelected = selectedLapId === lap.id;
              return (
                <button
                  key={`${lap.sessionId}-${lap.startTimestamp}-${lap.endTimestamp}`}
                  type="button"
                  onClick={() => setSelectedLapId(lap.id)}
                  className={`shrink-0 rounded border px-4 py-2 text-left transition ${
                    isSelected
                      ? "border-[#f94df9] bg-[#f94df9] text-black"
                      : "border-[#35fdad]/70 bg-[#003530] text-white hover:border-[#35fdad] hover:bg-[#35fdad] hover:text-[#003530]"
                  }`}
                >
                  <div className="text-xs opacity-75">Lap {lap.id}</div>
                  <div className="text-lg font-bold leading-tight">{lap.time}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
