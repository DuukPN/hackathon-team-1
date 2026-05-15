import { useState } from "react"
import { telemetryService, type GetTelemetryResponse, type TelemetryRow } from "./services/TelemetryService"

const TEST_START_TIMESTAMP = Date.UTC(2026, 4, 13, 11, 0, 0)
const TEST_LIMIT = 1000

export function TelemetryPage() {
  const [telemetry, setTelemetry] = useState<GetTelemetryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [startTimestamp, setStartTimestamp] = useState(String(TEST_START_TIMESTAMP))
  const [endTimestamp, setEndTimestamp] = useState(String(Date.now()))

  const parsedStartTimestamp = parseTimestampInput(startTimestamp)
  const parsedEndTimestamp = parseTimestampInput(endTimestamp)

  async function loadTelemetry() {
    const start = parsedStartTimestamp
    const end = parsedEndTimestamp

    if (start === null || end === null) {
      setTelemetry(null)
      setError("Start and end timestamps must be positive epoch millisecond integers.")
      return
    }

    if (start > end) {
      setTelemetry(null)
      setError("Start timestamp must be less than or equal to end timestamp.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await telemetryService.getTelemetry({
        startTimestamp: start,
        endTimestamp: end,
        limit: TEST_LIMIT,
      })

      setTelemetry(response)
    } catch (caughtError) {
      setTelemetry(null)
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load telemetry")
    } finally {
      setIsLoading(false)
    }
  }

  function setEndToNow() {
    setEndTimestamp(String(Date.now()))
  }

  function exportTelemetryCsv() {
    if (!telemetry || telemetry.data.length === 0) {
      return
    }

    const csv = toCsv(telemetry.data)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `telemetry-${telemetry.start_timestamp}-${telemetry.end_timestamp}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#003530] px-6 py-8 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <img src="/assets/LogowhiteBig.svg" alt="Synadia" className="mb-4 h-8" />
            <h1 className="text-2xl font-bold">Telemetry Data Test</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/"
              className="flex h-11 items-center justify-center rounded border border-white/30 px-4 text-sm font-semibold text-white transition hover:border-[#35fdad] hover:text-[#35fdad]"
            >
              Dashboard
            </a>
            <button
              type="button"
              onClick={loadTelemetry}
              disabled={isLoading}
              className="h-11 rounded bg-[#35fdad] px-4 text-sm font-semibold text-[#003530] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Loading telemetry..." : "Fetch telemetry"}
            </button>
            <button
              type="button"
              onClick={exportTelemetryCsv}
              disabled={!telemetry || telemetry.data.length === 0}
              className="h-11 rounded border border-[#35fdad] px-4 text-sm font-semibold text-[#35fdad] transition hover:bg-[#35fdad] hover:text-[#003530] disabled:cursor-not-allowed disabled:border-white/20 disabled:text-white/30 disabled:hover:bg-transparent"
            >
              Export CSV
            </button>
          </div>
        </header>

        <section className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-white/60">Start</div>
            <input
              type="number"
              value={startTimestamp}
              onChange={(event) => setStartTimestamp(event.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 font-mono text-white outline-none focus:border-[#35fdad]"
            />
            <div className="mt-1 font-mono text-xs text-white/50">{formatTimestampPreview(parsedStartTimestamp)}</div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 text-white/60">
              <span>End</span>
              <button type="button" onClick={setEndToNow} className="text-xs text-[#35fdad] hover:text-white">
                Use now
              </button>
            </div>
            <input
              type="number"
              value={endTimestamp}
              onChange={(event) => setEndTimestamp(event.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 font-mono text-white outline-none focus:border-[#35fdad]"
            />
            <div className="mt-1 font-mono text-xs text-white/50">{formatTimestampPreview(parsedEndTimestamp)}</div>
          </div>
          <div>
            <div className="text-white/60">Limit</div>
            <div className="font-mono">{TEST_LIMIT}</div>
          </div>
          <div>
            <div className="text-white/60">Rows returned</div>
            <div className="font-mono">{telemetry?.count ?? 0}</div>
          </div>
        </section>

        {error ? (
          <div className="rounded border border-red-300/40 bg-red-950/40 p-4 text-sm text-red-100">{error}</div>
        ) : null}

        <section className="min-h-[420px] overflow-hidden rounded border border-white/15 bg-black/30">
          <div className="border-b border-white/15 px-4 py-3 text-sm font-semibold">Telemetry results</div>
          <pre className="max-h-[70vh] overflow-auto p-4 text-xs leading-5 text-[#35fdad]">
            {telemetry ? JSON.stringify(telemetry.data, null, 2) : "Click Fetch telemetry to load data."}
          </pre>
        </section>
      </div>
    </div>
  )
}

function parseTimestampInput(value: string): number | null {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function formatTimestampPreview(timestamp: number | null): string {
  if (timestamp === null) {
    return "Invalid timestamp"
  }

  return new Date(timestamp).toISOString()
}

function toCsv(rows: TelemetryRow[]): string {
  const columns = Object.keys(rows[0]) as Array<keyof TelemetryRow>
  const header = columns.join(",")
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","))

  return [header, ...body].join("\n")
}

function escapeCsvValue(value: number | null): string {
  if (value === null) {
    return ""
  }

  return String(value)
}
