import type { TelemetryData } from "./services/TelemetryService";

export type HeatmapType = "speed" | "acceleration" | "temperature";

export type HeatmapSegment = {
  id: string;
  color: string;
  positions: [[number, number], [number, number]];
};

type TrackPoint = Omit<TelemetryData, "timestamp" | "session_id">;
type HeatmapRange = {
  min: number;
  max: number;
};

const LAP_START_TIMESTAMP = Date.UTC(2026, 4, 13, 11, 0, 0);
const LAP_DURATION_MS = 92_000;

const ZANDVOORT_LAP_POINTS: TrackPoint[] = [
  { latitude: 52.38870, longitude: 4.54235, speed: 270, acc_x: 6, acc_y: 22, acc_z: 9.81, pitch_angle: 0.02, yaw_angle: 0.00, temperature: 65 },
  { latitude: 52.38965, longitude: 4.54345, speed: 305, acc_x: 8, acc_y: 18, acc_z: 9.81, pitch_angle: 0.03, yaw_angle: 0.14, temperature: 67 },
  { latitude: 52.39055, longitude: 4.54495, speed: 325, acc_x: 4, acc_y: 12, acc_z: 9.81, pitch_angle: 0.02, yaw_angle: 0.31, temperature: 68 },
  { latitude: 52.39115, longitude: 4.54695, speed: 300, acc_x: -10, acc_y: -20, acc_z: 9.81, pitch_angle: -0.01, yaw_angle: 0.55, temperature: 71 },
  { latitude: 52.39065, longitude: 4.54845, speed: 170, acc_x: -24, acc_y: -28, acc_z: 9.81, pitch_angle: -0.06, yaw_angle: 0.92, temperature: 78 },
  { latitude: 52.38945, longitude: 4.54915, speed: 145, acc_x: -31, acc_y: 8, acc_z: 9.81, pitch_angle: -0.08, yaw_angle: 1.24, temperature: 82 },
  { latitude: 52.38835, longitude: 4.54855, speed: 185, acc_x: -18, acc_y: 20, acc_z: 9.81, pitch_angle: -0.04, yaw_angle: 1.62, temperature: 80 },
  { latitude: 52.38745, longitude: 4.54725, speed: 235, acc_x: 12, acc_y: 24, acc_z: 9.81, pitch_angle: 0.01, yaw_angle: 1.95, temperature: 74 },
  { latitude: 52.38655, longitude: 4.54615, speed: 250, acc_x: 22, acc_y: 12, acc_z: 9.81, pitch_angle: 0.05, yaw_angle: 2.18, temperature: 72 },
  { latitude: 52.38555, longitude: 4.54545, speed: 285, acc_x: 14, acc_y: 18, acc_z: 9.81, pitch_angle: 0.04, yaw_angle: 2.39, temperature: 70 },
  { latitude: 52.38445, longitude: 4.54435, speed: 315, acc_x: 6, acc_y: 14, acc_z: 9.81, pitch_angle: 0.02, yaw_angle: 2.63, temperature: 68 },
  { latitude: 52.38365, longitude: 4.54285, speed: 330, acc_x: -8, acc_y: 12, acc_z: 9.81, pitch_angle: 0.00, yaw_angle: 2.91, temperature: 68 },
  { latitude: 52.38310, longitude: 4.54125, speed: 260, acc_x: -26, acc_y: -22, acc_z: 9.81, pitch_angle: -0.05, yaw_angle: -2.98, temperature: 77 },
  { latitude: 52.38345, longitude: 4.53995, speed: 155, acc_x: -33, acc_y: -12, acc_z: 9.81, pitch_angle: -0.09, yaw_angle: -2.62, temperature: 84 },
  { latitude: 52.38445, longitude: 4.53910, speed: 190, acc_x: -15, acc_y: 20, acc_z: 9.81, pitch_angle: -0.03, yaw_angle: -2.31, temperature: 80 },
  { latitude: 52.38560, longitude: 4.53875, speed: 245, acc_x: 18, acc_y: 21, acc_z: 9.81, pitch_angle: 0.03, yaw_angle: -1.92, temperature: 74 },
  { latitude: 52.38685, longitude: 4.53925, speed: 295, acc_x: 10, acc_y: 18, acc_z: 9.81, pitch_angle: 0.04, yaw_angle: -1.44, temperature: 70 },
  { latitude: 52.38795, longitude: 4.54035, speed: 340, acc_x: 4, acc_y: 15, acc_z: 9.81, pitch_angle: 0.03, yaw_angle: -0.89, temperature: 68 },
  { latitude: 52.38855, longitude: 4.54165, speed: 360, acc_x: 2, acc_y: 10, acc_z: 9.81, pitch_angle: 0.02, yaw_angle: -0.32, temperature: 66 },
  { latitude: 52.38870, longitude: 4.54235, speed: 370, acc_x: 0, acc_y: 8, acc_z: 9.81, pitch_angle: 0.02, yaw_angle: 0.00, temperature: 66 },
];

export class TestLapData {
  readonly points: TelemetryData[];

  constructor(points: Array<TrackPoint | TelemetryData> = ZANDVOORT_LAP_POINTS) {
    const denominator = Math.max(1, points.length - 1);

    this.points = points.map((point, index) => ({
      ...point,
      session_id: "session_id" in point ? point.session_id : 1,
      timestamp: "timestamp" in point
        ? point.timestamp
        : LAP_START_TIMESTAMP + Math.round((index / denominator) * LAP_DURATION_MS),
    }));
  }

  getInterpolatedPoints(pointsPerSegment = 12): TelemetryData[] {
    const interpolated: TelemetryData[] = [];

    if (this.points.length <= 1) {
      return this.points;
    }

    for (let index = 0; index < this.points.length - 1; index += 1) {
      const current = this.points[index];
      const next = this.points[index + 1];

      for (let step = 0; step < pointsPerSegment; step += 1) {
        interpolated.push(this.interpolatePoint(current, next, step / pointsPerSegment));
      }
    }

    interpolated.push(this.points[this.points.length - 1]);
    return interpolated;
  }

  getHeatmapSegments(type: HeatmapType, pointsPerSegment = 12): HeatmapSegment[] {
    const points = this.getInterpolatedPoints(pointsPerSegment);
    const range = this.getHeatmapRange(type);

    return points.slice(0, -1).map((point, index) => {
      const next = points[index + 1];

      return {
        id: `${type}-${index}`,
        color: TestLapData.getHeatmapColor(point, type, range),
        positions: [
          [point.latitude, point.longitude],
          [next.latitude, next.longitude],
        ],
      };
    });
  }

  getPointHeatmapColor(point: TelemetryData, type: HeatmapType): string {
    return TestLapData.getHeatmapColor(point, type, this.getHeatmapRange(type));
  }

  getHeatmapRange(type: HeatmapType): HeatmapRange {
    const values = this.points.map((point) => TestLapData.getHeatmapValue(point, type));

    if (values.length === 0) {
      return { min: 0, max: 0 };
    }

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  static getHeatmapColor(point: TelemetryData, type: HeatmapType, range: HeatmapRange): string {
    if (type === "speed") {
      return this.interpolateColor(this.getHeatmapValue(point, type), range, [255, 0, 0], [0, 255, 0]);
    }

    return this.interpolateColor(this.getHeatmapValue(point, type), range, [0, 90, 255], [255, 0, 0]);
  }

  private interpolatePoint(start: TelemetryData, end: TelemetryData, fraction: number): TelemetryData {
    return {
      timestamp: Math.round(this.lerp(start.timestamp, end.timestamp, fraction)),
      session_id: start.session_id,
      latitude: this.lerp(start.latitude, end.latitude, fraction),
      longitude: this.lerp(start.longitude, end.longitude, fraction),
      speed: this.lerp(start.speed, end.speed, fraction),
      acc_x: this.lerp(start.acc_x, end.acc_x, fraction),
      acc_y: this.lerp(start.acc_y, end.acc_y, fraction),
      acc_z: this.lerp(start.acc_z, end.acc_z, fraction),
      pitch_angle: this.lerp(start.pitch_angle, end.pitch_angle, fraction),
      yaw_angle: this.lerp(start.yaw_angle, end.yaw_angle, fraction),
      temperature: this.lerp(start.temperature, end.temperature, fraction),
    };
  }

  private lerp(start: number, end: number, fraction: number) {
    return start + ((end - start) * fraction);
  }

  private static interpolateColor(
    value: number,
    range: HeatmapRange,
    startColor: [number, number, number],
    endColor: [number, number, number],
  ): string {
    const fraction = range.max === range.min
      ? 0.5
      : Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
    const [r1, g1, b1] = startColor;
    const [r2, g2, b2] = endColor;
    const r = Math.round(r1 + ((r2 - r1) * fraction));
    const g = Math.round(g1 + ((g2 - g1) * fraction));
    const b = Math.round(b1 + ((b2 - b1) * fraction));

    return `rgb(${r}, ${g}, ${b})`;
  }

  private static getHeatmapValue(point: TelemetryData, type: HeatmapType): number {
    if (type === "speed") return point.speed;
    if (type === "acceleration") return point.acc_x;
    return point.temperature;
  }
}
