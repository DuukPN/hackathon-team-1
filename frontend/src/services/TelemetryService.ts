export type TelemetryRow = {
  timestamp: number | null
  team_id: number | null
  session_id: number | null
  latitude: number | null
  longitude: number | null
  altitude: number | null
  speed: number | null
  course: number | null
  satellites: number | null
  gps_timestamp: number | null
  acc_x: number | null
  acc_y: number | null
  acc_z: number | null
  gyro_x: number | null
  gyro_y: number | null
  gyro_z: number | null
  mag_x: number | null
  mag_y: number | null
  mag_z: number | null
  status_mag: number | null
  status_gyro: number | null
  status_acc: number | null
  status_sys: number | null
  pitch_rate: number | null
  roll_rate: number | null
  yaw_rate: number | null
  pitch_angle: number | null
  roll_angle: number | null
  yaw_angle: number | null
  temperature: number | null
  gravity_x: number | null
  gravity_y: number | null
  gravity_z: number | null
  abs_orientation_x: number | null
  abs_orientation_y: number | null
  abs_orientation_z: number | null
  linear_acc_x: number | null
  linear_acc_y: number | null
  linear_acc_z: number | null
}

export type TelemetryData = {
  timestamp: number
  session_id: number
  latitude: number
  longitude: number
  speed: number
  acc_x: number
  acc_y: number
  acc_z: number
  pitch_angle: number
  yaw_angle: number
  temperature: number
}

export type LapData = {
  id: number
  time: string
  timeMs: number
  diff: string
  status: "fastest" | "good" | "worse" | "normal"
}

export type GetTelemetryRequest = {
  startTimestamp: number
  endTimestamp: number
  limit?: number
  sessionId?: number
}

export type GetTelemetryResponse = {
  start_timestamp: number
  end_timestamp: number
  limit: number
  session_id?: number
  count: number
  data: TelemetryRow[]
}

type ApiErrorResponse = {
  error: string
}

const TELEMETRY_COLUMNS = [
  "timestamp", "team_id", "session_id", "latitude", "longitude", "altitude",
  "speed", "course", "satellites", "gps_timestamp", "acc_x", "acc_y", "acc_z",
  "gyro_x", "gyro_y", "gyro_z", "mag_x", "mag_y", "mag_z", "status_mag",
  "status_gyro", "status_acc", "status_sys", "pitch_rate", "roll_rate",
  "yaw_rate", "pitch_angle", "roll_angle", "yaw_angle", "temperature",
  "gravity_x", "gravity_y", "gravity_z", "abs_orientation_x",
  "abs_orientation_y", "abs_orientation_z", "linear_acc_x", "linear_acc_y",
  "linear_acc_z",
] as const satisfies readonly (keyof TelemetryRow)[]

export class TelemetryService {
  private readonly baseUrl: string

  constructor() {
    // Utilize environment variables for infrastructure flexibility
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL || "https://00jbtatxmh.execute-api.eu-west-1.amazonaws.com").replace(/\/$/, "")
  }

  async getTelemetry(request: GetTelemetryRequest): Promise<GetTelemetryResponse> {
    this.validateRequest(request)

    const url = new URL(`${this.baseUrl}/api/get_telemetry`)
    url.searchParams.set("start_timestamp", String(request.startTimestamp))
    url.searchParams.set("end_timestamp", String(request.endTimestamp))

    if (request.limit !== undefined) {
      url.searchParams.set("limit", String(request.limit))
    }

    if (request.sessionId !== undefined) {
      url.searchParams.set("session_id", String(request.sessionId))
    }

    const response = await fetch(url)
    const body: unknown = await response.json()

    if (!response.ok) {
      throw new Error(this.getApiErrorMessage(body, response.status))
    }

    return this.toGetTelemetryResponse(body)
  }

  async getTelemetryData(request: GetTelemetryRequest): Promise<TelemetryData[]> {
    const response = await this.getTelemetry(request)
    return response.data.map((row) => this.toTelemetryData(row)).filter((row): row is TelemetryData => row !== null)
  }

  async getLatestTelemetryData(request: GetTelemetryRequest): Promise<TelemetryData | null> {
    const rows = await this.getTelemetryData(request)
    return rows.at(-1) ?? null
  }

  toTelemetryData(row: TelemetryRow): TelemetryData | null {
    if (
      row.timestamp === null ||
      row.session_id === null ||
      row.latitude === null ||
      row.longitude === null ||
      row.speed === null ||
      row.acc_x === null ||
      row.acc_y === null ||
      row.acc_z === null ||
      row.pitch_angle === null ||
      row.yaw_angle === null ||
      row.temperature === null
    ) {
      return null
    }

    return {
      timestamp: row.timestamp, // Preserved as integer
      session_id: row.session_id,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      acc_x: row.acc_x,
      acc_y: row.acc_y,
      acc_z: row.acc_z,
      pitch_angle: row.pitch_angle,
      yaw_angle: row.yaw_angle,
      temperature: row.temperature,
    }
  }

  toLapData(id: number, timeMs: number, bestLapTimeMs: number): LapData {
    const diffMs = timeMs - bestLapTimeMs
    const diffSecs = Math.abs(diffMs / 1000)
    const dMin = Math.floor(diffSecs / 60)
    const dSec = (diffSecs % 60).toFixed(2).padStart(5, "0")
    const minutes = Math.floor(timeMs / 60000)
    const seconds = ((timeMs % 60000) / 1000).toFixed(2).padStart(5, "0")

    return {
      id,
      time: `${minutes}:${seconds}`,
      timeMs,
      diff: id <= 1 ? "" : `${diffMs < 0 ? "-" : "+"}${dMin}:${dSec}`,
      status: id <= 1 ? "normal" : diffMs < 0 ? "fastest" : "worse",
    }
  }

  private validateRequest(request: GetTelemetryRequest): void {
    this.assertEpochMilliseconds(request.startTimestamp, "startTimestamp")
    this.assertEpochMilliseconds(request.endTimestamp, "endTimestamp")

    if (request.startTimestamp > request.endTimestamp) {
      throw new Error("startTimestamp must be less than or equal to endTimestamp")
    }

    if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1)) {
      throw new Error("limit must be a positive integer")
    }

    if (request.sessionId !== undefined && (!Number.isInteger(request.sessionId) || request.sessionId < 0)) {
      throw new Error("sessionId must be a positive integer")
    }
  }

  private toGetTelemetryResponse(value: unknown): GetTelemetryResponse {
    if (!this.isObject(value)) {
      throw new Error("Telemetry API returned an invalid response")
    }

    return {
      start_timestamp: this.toNumber(value.start_timestamp, "start_timestamp"),
      end_timestamp: this.toNumber(value.end_timestamp, "end_timestamp"),
      limit: this.toNumber(value.limit, "limit"),
      session_id: this.toOptionalNumber(value.session_id, "session_id"),
      count: this.toNumber(value.count, "count"),
      data: this.toTelemetryRows(value.data),
    }
  }

  private toTelemetryRows(value: unknown): TelemetryRow[] {
    if (!Array.isArray(value)) {
      throw new Error("Telemetry API response data must be an array")
    }

    return value.map((row, index) => this.toTelemetryRow(row, index))
  }

  private toTelemetryRow(value: unknown, index: number): TelemetryRow {
    if (!this.isObject(value)) {
      throw new Error(`Telemetry row ${index} must be an object`)
    }

    return TELEMETRY_COLUMNS.reduce((row, column) => {
      row[column] = this.toNullableNumber(value[column], `data[${index}].${column}`) as any
      return row
    }, {} as TelemetryRow)
  }

  private toNullableNumber(value: unknown, fieldName: string): number | null {
    if (value === null) {
      return null
    }

    return this.toNumber(value, fieldName)
  }

  private toOptionalNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined) {
      return undefined
    }

    return this.toNumber(value, fieldName)
  }

  private toNumber(value: unknown, fieldName: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Telemetry API response field ${fieldName} must be a finite number`)
    }

    return value
  }

  private assertEpochMilliseconds(value: number, fieldName: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${fieldName} must be a positive epoch millisecond integer`)
    }
  }

  private getApiErrorMessage(body: unknown, status: number): string {
    if (this.isApiErrorResponse(body)) {
      return body.error
    }

    return `Telemetry API request failed with status ${status}`
  }

  private isApiErrorResponse(value: unknown): value is ApiErrorResponse {
    return this.isObject(value) && typeof value.error === "string"
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}

export const telemetryService = new TelemetryService()
