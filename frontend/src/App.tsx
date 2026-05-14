import { useState } from "react"
import { telemetryService, type GetTelemetryResponse } from "./services/TelemetryService"

const TEST_START_TIMESTAMP = Date.UTC(2026, 4, 13, 11, 0, 0)

export function App() {
  const [telemetry, setTelemetry] = useState<GetTelemetryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function loadTelemetry() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await telemetryService.getTelemetry({
        startTimestamp: TEST_START_TIMESTAMP,
        endTimestamp: Date.now(),
        limit: 1000,
      })

      setTelemetry(response)
    } catch (caughtError) {
      setTelemetry(null)
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load telemetry")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#003530] px-6 py-8 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-white/15 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <img src="/assets/LogowhiteBig.svg" alt="Synadia" className="mb-4 h-8" />
            <h1 className="text-2xl font-bold">Hackathon Team 1</h1>
          </div>

          <button
            type="button"
            onClick={loadTelemetry}
            disabled={isLoading}
            className="h-11 w-full rounded bg-[#35fdad] px-4 text-sm font-semibold text-[#003530] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isLoading ? "Loading telemetry..." : "Fetch telemetry"}
          </button>
        </header>

        <section className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-white/60">Start</div>
            <div className="font-mono">{new Date(TEST_START_TIMESTAMP).toISOString()}</div>
          </div>
          <div>
            <div className="text-white/60">End</div>
            <div className="font-mono">Current time when clicked</div>
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
