import { useTelemetry } from "./useTelemetry";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
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

const ZANDVOORT_CENTER: [number, number] = [52.3888, 4.5422];

export function App() {
  if (window.location.pathname === "/telemetry") {
    return <TelemetryPage />;
  }

  const { data, latest, laps, currentLapTime } = useTelemetry();

  const currentLapMins = Math.floor(currentLapTime / 60000);
  const currentLapSecs = ((currentLapTime % 60000) / 1000).toFixed(2).padStart(5, "0");

  const gForceX = latest?.acc_x || 0;
  const gForceY = latest?.acc_y || 0;

  const lat = latest?.latitude || ZANDVOORT_CENTER[0];
  const lon = latest?.longitude || ZANDVOORT_CENTER[1];

  const startTime = data.length > 0 ? new Date(data[0].timestamp).getTime() : 0;
  const chartData = data.map((d) => {
    const elapsedSeconds = startTime ? (new Date(d.timestamp).getTime() - startTime) / 1000 : 0;
    return {
      time: elapsedSeconds.toFixed(1),
      speed: d.speed,
    };
  });

  const pathPositions: [number, number][] = data.map(d => [d.latitude, d.longitude]);

  return (
    <div className="min-h-screen p-4 bg-[#003530] text-white font-mono flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <img src="/assets/LogowhiteBig.svg" alt="Synadia" className="h-6" />
        </div>
        <a
          href="/telemetry"
          className="rounded border border-[#35fdad] px-3 py-2 text-xs font-semibold text-[#35fdad] transition hover:bg-[#35fdad] hover:text-[#003530]"
        >
          Telemetry data
        </a>
      </div>

      <div className="flex gap-6 h-[450px]">
        {/* Map Area */}
        <div className="flex-grow border-2 border-[#35fdad] rounded-md bg-black relative overflow-hidden flex flex-col">
          <div className="w-full h-full relative" style={{ isolation: "isolate" }}>
            <MapContainer
              center={ZANDVOORT_CENTER}
              zoom={15}
              scrollWheelZoom={true}
              style={{ height: "100%", width: "100%", zIndex: 0 }}
            >
              <TileLayer
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
              {pathPositions.length > 0 && (
                <Polyline positions={pathPositions} color="#35fdad" weight={4} opacity={0.8} />
              )}
              {latest && <Marker position={[lat, lon]} />}
            </MapContainer>
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-96 flex flex-col gap-6">
          {/* G-Force */}
          <div className="border border-white rounded-md p-2 bg-black flex-[0.8] flex flex-col items-center justify-center relative">
            <h2 className="absolute top-2 left-2 text-[#35fdad] text-sm">G-Force</h2>
            <div className="w-32 h-32 relative border border-white mt-4 rounded-md">
              <div className="absolute w-full h-[1px] bg-white top-1/2 left-0" />
              <div className="absolute w-[1px] h-full bg-white left-1/2 top-0" />
              <div className="absolute w-[50%] h-[50%] border border-gray-600 top-1/4 left-1/4 rounded-full" />
              <div
                className="absolute w-4 h-4 rounded-full bg-[#f94df9] transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                style={{
                  left: `${Math.max(0, Math.min(100, 50 + gForceX * 15))}%`,
                  top: `${Math.max(0, Math.min(100, 50 + gForceY * 15))}%`
                }}
              />
            </div>
          </div>

          {/* Laps List */}
          <div className="border border-white rounded-md p-4 bg-black flex-grow flex flex-col overflow-hidden max-h-[340px]">
            <h2 className="text-[#35fdad] text-sm mb-3">Lap Times</h2>
            
            <div className="border border-gray-700 rounded-md p-2 bg-[#111] mb-3 shrink-0">
              <div className="text-xs text-gray-400">Current lap</div>
              <div className="text-xl font-bold">{currentLapMins}:{currentLapSecs}</div>
            </div>
            
            <div className="flex flex-col gap-2 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
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
                  <div key={lap.id} className="flex justify-between items-center border-b border-gray-800 pb-1 last:border-0 shrink-0">
                    <div className="text-sm text-gray-500 w-16">Lap {lap.id}</div>
                    <div className={`text-lg font-sans font-bold flex-grow text-center ${timeColor}`}>{lap.time}</div>
                    <div className={`text-sm ${diffColor} w-20 text-right`}>{lap.diff}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Speed Graph Full Width at Bottom */}
      <div className="border border-white rounded-md p-4 bg-black w-full h-[250px] flex flex-col relative">
        <h2 className="absolute top-2 left-4 text-[#35fdad] text-sm z-10 w-full">
          Speed Trace 
          {latest && <span className="ml-4 text-white text-xl font-bold">{latest.speed.toFixed(0)} km/h</span>}
        </h2>
        <div className="w-full h-full mt-6 flex-grow pb-2 z-10 text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis 
                dataKey="time" 
                stroke="#666" 
                tick={{ fill: '#666', fontSize: 10 }}
                tickFormatter={(val) => `${val}s`}
                minTickGap={30}
              />
              <YAxis domain={['auto', 'auto']} stroke="#ccc" />
              <Tooltip 
                contentStyle={{ backgroundColor: "#111", border: "1px solid #35fdad" }}
                itemStyle={{ color: "#35fdad" }}
                labelStyle={{ display: "none" }}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#35fdad"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}