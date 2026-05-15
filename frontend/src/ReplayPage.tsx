import { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from "react-leaflet";
import { TestLapData, type HeatmapType } from "./TestLapData";
import type { TelemetryData } from "./services/TelemetryService";

const ZANDVOORT_CENTER: [number, number] = [52.3880, 4.5440];
const TEST_LAP = new TestLapData();
const INTERPOLATED_POINTS_PER_SEGMENT = 14;

function clampIndex(index: number, length: number) {
  if (length === 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function formatTelemetryTime(point: TelemetryData | null) {
  if (!point) return "--:--:--.---";
  return new Date(point.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function getGForcePosition(point: TelemetryData | null) {
  const gx = ((point?.acc_x ?? 0) / 9.81);
  const gy = ((point?.acc_y ?? 0) / 9.81);

  return {
    gx,
    gy,
    left: Math.max(0, Math.min(100, 50 + (gx / 3) * 50)),
    top: Math.max(0, Math.min(100, 50 + (gy / 3) * 50)),
  };
}

function formatMeasurementArray(values: number[], digits: number) {
  return `[${values.map((value) => value.toFixed(digits)).join(", ")}]`;
}

function getGForceArray(point: TelemetryData) {
  return [point.acc_x / 9.81, point.acc_y / 9.81, point.acc_z / 9.81];
}

function DataPointTooltip({ point }: { point: TelemetryData }) {
  return (
    <Tooltip direction="top" offset={[0, -8]} opacity={1}>
      <div className="min-w-56 font-mono text-xs leading-5 text-[#003530]">
        <div className="font-bold">Telemetry point</div>
        <div>Timestamp: {new Date(point.timestamp).toISOString()}</div>
        <div>Speed: {point.speed.toFixed(2)} km/h</div>
        <div>G-force xyz: {formatMeasurementArray(getGForceArray(point), 3)}</div>
        <div>Acceleration xyz: {formatMeasurementArray([point.acc_x, point.acc_y, point.acc_z], 2)} m/s2</div>
        <div>Temperature: {point.temperature.toFixed(2)} C</div>
      </div>
    </Tooltip>
  );
}

export function ReplayPage() {
  const [heatmapType, setHeatmapType] = useState<HeatmapType>("speed");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const lapPoints = useMemo(() => TEST_LAP.getInterpolatedPoints(INTERPOLATED_POINTS_PER_SEGMENT), []);
  const heatmapSegments = useMemo(
    () => TEST_LAP.getHeatmapSegments(heatmapType, INTERPOLATED_POINTS_PER_SEGMENT),
    [heatmapType],
  );

  const boundedIndex = clampIndex(selectedIndex, lapPoints.length);
  const selectedPoint = lapPoints[boundedIndex] ?? null;
  const gForce = getGForcePosition(selectedPoint);

  const selectedPosition =
    selectedPoint && selectedPoint.latitude !== 0 && selectedPoint.longitude !== 0
      ? ([selectedPoint.latitude, selectedPoint.longitude] as [number, number])
      : null;

  return (
    <div className="min-h-screen bg-[#003530] p-6 font-mono text-white">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
        <header className="flex items-center justify-between">
          <img src="/assets/LogowhiteBig.svg" alt="Synadia" className="h-8" />
          <div className="flex gap-3">
            <a
              href="/"
              className="rounded border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#35fdad] hover:text-[#35fdad]"
            >
              Dashboard
            </a>
            <a
              href="/telemetry"
              className="rounded border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#35fdad] hover:text-[#35fdad]"
            >
              Telemetry data
            </a>
          </div>
        </header>

        <main className="grid min-h-[620px] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="overflow-hidden rounded-md border-2 border-[#35fdad] bg-black shadow-lg shadow-black/50">
            <MapContainer
              center={selectedPosition ?? ZANDVOORT_CENTER}
              zoom={15}
              scrollWheelZoom={true}
              zoomControl={false}
              style={{ height: "100%", minHeight: "620px", width: "100%", zIndex: 0 }}
            >
              <TileLayer
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
              {heatmapSegments.map((segment) => (
                <Polyline
                  key={segment.id}
                  positions={segment.positions}
                  color={segment.color}
                  weight={6}
                  opacity={0.92}
                />
              ))}
              {TEST_LAP.points.map((point, index) => (
                <CircleMarker
                  key={`${point.timestamp}-${index}`}
                  center={[point.latitude, point.longitude]}
                  radius={4}
                  pathOptions={{
                    color: "#000000",
                    weight: 1,
                    fillColor: TEST_LAP.getPointHeatmapColor(point, heatmapType),
                    fillOpacity: 1,
                  }}
                >
                  <DataPointTooltip point={point} />
                </CircleMarker>
              ))}
              {selectedPosition ? (
                <CircleMarker
                  center={selectedPosition}
                  radius={8}
                  pathOptions={{ color: "#003530", weight: 2, fillColor: "#f94df9", fillOpacity: 1 }}
                />
              ) : null}
            </MapContainer>
          </section>

          <section className="flex flex-col gap-5 rounded-md border border-white bg-black p-6 shadow-lg shadow-black/50">
            <div>
              <h1 className="text-xl font-bold text-[#35fdad]">Replay</h1>
              <div className="mt-2 text-sm text-white/60">
                {`${boundedIndex + 1} / ${lapPoints.length} interpolated points`}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="heatmap-type" className="text-xs uppercase tracking-wider text-gray-400">
                Heatmap
              </label>
              <select
                id="heatmap-type"
                value={heatmapType}
                onChange={(event) => setHeatmapType(event.target.value as HeatmapType)}
                className="h-11 rounded border border-gray-700 bg-[#111] px-3 text-white outline-none transition focus:border-[#35fdad]"
              >
                <option value="speed">Speed</option>
                <option value="acceleration">Acceleration</option>
                <option value="temperature">Temperature</option>
              </select>
            </div>

            <div className="flex flex-col gap-2 rounded border border-gray-700 bg-[#111] p-4">
              <div className="text-xs uppercase tracking-wider text-gray-400">Selected time</div>
              <div className="text-2xl font-bold">{formatTelemetryTime(selectedPoint ?? null)}</div>
              <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
                <span>{selectedPoint ? `${selectedPoint.speed.toFixed(0)} km/h` : "-- km/h"}</span>
                <span>{selectedPoint ? `${selectedPoint.acc_x.toFixed(1)} m/s2` : "-- m/s2"}</span>
                <span>{selectedPoint ? `${selectedPoint.temperature.toFixed(0)} C` : "-- C"}</span>
              </div>
            </div>

            <div className="relative mx-auto mt-4 h-[300px] w-[300px] rounded-full bg-[#0a0a0a]">
              <h2 className="absolute -top-10 left-0 text-lg font-bold text-[#35fdad]">G-Force</h2>
              <div className="absolute left-0 top-1/2 h-[1px] w-full bg-gray-700" />
              <div className="absolute left-1/2 top-0 h-full w-[1px] bg-gray-700" />
              <div className="absolute left-[33.33%] top-[33.33%] h-[33.33%] w-[33.33%] rounded-full border border-gray-600" />
              <div className="absolute left-[16.66%] top-[16.66%] h-[66.66%] w-[66.66%] rounded-full border border-gray-600" />
              <div className="absolute left-0 top-0 h-full w-full rounded-full border border-gray-500" />
              <span className="absolute left-1/2 top-[16.66%] -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0a] px-1 text-[12px] text-gray-400">
                2G
              </span>
              <span className="absolute left-1/2 top-[33.33%] -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0a] px-1 text-[12px] text-gray-400">
                1G
              </span>
              <div
                className="absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f94df9] shadow-[0_0_12px_#f94df9] transition-all"
                style={{ left: `${gForce.left}%`, top: `${gForce.top}%` }}
              />
            </div>

            <div className="mt-auto grid grid-cols-2 gap-4 text-sm">
              <div className="rounded border border-gray-700 bg-[#111] p-3">
                <div className="text-gray-400">Lateral</div>
                <div className="text-xl font-bold">{gForce.gx.toFixed(2)}G</div>
              </div>
              <div className="rounded border border-gray-700 bg-[#111] p-3">
                <div className="text-gray-400">Longitudinal</div>
                <div className="text-xl font-bold">{gForce.gy.toFixed(2)}G</div>
              </div>
            </div>
          </section>
        </main>

        <section className="rounded-md border border-white bg-black px-6 py-5 shadow-lg shadow-black/50">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-bold text-[#35fdad]">Time</span>
            <span className="text-white/60">Move the knob to step through telemetry points</span>
          </div>
          <input
            aria-label="Replay time"
            type="range"
            min={0}
            max={Math.max(0, lapPoints.length - 1)}
            step={1}
            value={boundedIndex}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
            className="replay-time-slider w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          />
        </section>
      </div>
    </div>
  );
}
