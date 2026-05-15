import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import {
  DynamoDBClient,
  QueryCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { Hono } from "hono";

export const app = new Hono();

const stsClient = new STSClient();
const dynamoClient = new DynamoDBClient();
let cachedAthenaClient: AthenaClient | undefined;
let cachedAthenaClientExpiresAt = 0;

const DEFAULT_TELEMETRY_LIMIT = 1000;
const MAX_TELEMETRY_LIMIT = 10_000;
const TEAM_ID_FILTER = 1;

const TELEMETRY_COLUMNS = [
  "timestamp",
  "team_id",
  "session_id",
  "latitude",
  "longitude",
  "altitude",
  "speed",
  "course",
  "satellites",
  "gps_timestamp",
  "acc_x",
  "acc_y",
  "acc_z",
  "gyro_x",
  "gyro_y",
  "gyro_z",
  "mag_x",
  "mag_y",
  "mag_z",
  "status_mag",
  "status_gyro",
  "status_acc",
  "status_sys",
  "pitch_rate",
  "roll_rate",
  "yaw_rate",
  "pitch_angle",
  "roll_angle",
  "yaw_angle",
  "temperature",
  "gravity_x",
  "gravity_y",
  "gravity_z",
  "abs_orientation_x",
  "abs_orientation_y",
  "abs_orientation_z",
  "linear_acc_x",
  "linear_acc_y",
  "linear_acc_z",
] as const;

type TelemetryColumn = (typeof TELEMETRY_COLUMNS)[number];
type TelemetryRow = Record<TelemetryColumn, number | null>;

app.get("/api/hello", (c) => {
  console.log("Hello route hit");
  return c.json({ message: "Hello from hackathon-team-1!" });
});


// Return format for this endpoint isis:
// {
//   "start_timestamp": 123,
//   "end_timestamp": 456,
//   "count": 10,
//   "data": [...]
// }
app.get("/api/get_telemetry", async (c) => {
  const startTimestamp = parseTimestampQueryParam(c.req.query("start_timestamp"), "start_timestamp");
  const endTimestamp = parseTimestampQueryParam(c.req.query("end_timestamp"), "end_timestamp");
  const limit = parseLimitQueryParam(c.req.query("limit"));
  const sessionId = parseOptionalIntegerQueryParam(c.req.query("session_id"), "session_id");

  if (startTimestamp instanceof Error) {
    return c.json({ error: startTimestamp.message }, 400);
  }

  if (endTimestamp instanceof Error) {
    return c.json({ error: endTimestamp.message }, 400);
  }

  if (limit instanceof Error) {
    return c.json({ error: limit.message }, 400);
  }

  if (sessionId instanceof Error) {
    return c.json({ error: sessionId.message }, 400);
  }

  if (startTimestamp > endTimestamp) {
    return c.json({ error: "start_timestamp must be less than or equal to end_timestamp" }, 400);
  }

  try {
    const rows = await getTelemetryBetween(startTimestamp, endTimestamp, limit, sessionId);
    return c.json({
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      limit,
      session_id: sessionId,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Failed to get telemetry", {
      startTimestamp,
      endTimestamp,
      limit,
      sessionId,
      error,
    });

    return c.json({ error: "Failed to fetch telemetry data" }, 500);
  }
});

function parseTimestampQueryParam(value: string | undefined, name: string): number | Error {
  if (value === undefined || value.length === 0) {
    return new Error(`Missing required query parameter: ${name}`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return new Error(`${name} must be a positive epoch millisecond integer`);
  }

  return parsed;
}

function parseLimitQueryParam(value: string | undefined): number | Error {
  if (value === undefined || value.length === 0) {
    return DEFAULT_TELEMETRY_LIMIT;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return new Error("limit must be a positive integer");
  }

  if (parsed > MAX_TELEMETRY_LIMIT) {
    return new Error(`limit must be less than or equal to ${MAX_TELEMETRY_LIMIT}`);
  }

  return parsed;
}

function parseOptionalIntegerQueryParam(value: string | undefined, name: string): number | undefined | Error {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

async function getTelemetryBetween(
  startTimestamp: number,
  endTimestamp: number,
  limit: number,
  sessionId: number | undefined,
): Promise<TelemetryRow[]> {
  return getTelemetryRowsFromDynamoDb(startTimestamp, endTimestamp, limit, sessionId);
}

async function getTelemetryRowsFromDynamoDb(
  startTimestamp: number,
  endTimestamp: number,
  limit: number,
  sessionId: number | undefined,
): Promise<TelemetryRow[]> {
  const tableName = getRequiredEnv("DYNAMODB_TABLE_NAME");
  const rows: TelemetryRow[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#team_id = :team_id AND #timestamp BETWEEN :start_timestamp AND :end_timestamp",
        FilterExpression: sessionId === undefined ? undefined : "#session_id = :session_id",
        ExpressionAttributeNames: {
          "#team_id": "team_id",
          "#timestamp": "timestamp",
          ...(sessionId === undefined ? {} : { "#session_id": "session_id" }),
        },
        ExpressionAttributeValues: {
          ":team_id": { N: String(TEAM_ID_FILTER) },
          ":start_timestamp": { N: String(startTimestamp) },
          ":end_timestamp": { N: String(endTimestamp) },
          ...(sessionId === undefined ? {} : { ":session_id": { N: String(sessionId) } }),
        },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: Math.max(1, limit - rows.length),
        ScanIndexForward: true,
      }),
    );

    for (const item of result.Items ?? []) {
      rows.push(toTelemetryRowFromDynamoDbItem(item));

      if (rows.length >= limit) {
        break;
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey && rows.length < limit);

  console.log("DynamoDB telemetry query returned rows", {
    startTimestamp,
    endTimestamp,
    limit,
    sessionId,
    rowCount: rows.length,
  });

  return rows;
}

function toTelemetryRowFromDynamoDbItem(item: Record<string, AttributeValue>): TelemetryRow {
  return TELEMETRY_COLUMNS.reduce((row, column) => {
    row[column] = toNumberFromAttributeValue(item[column]);
    return row;
  }, {} as TelemetryRow);
}

function toNumberFromAttributeValue(value: AttributeValue | undefined): number | null {
  if (!value || !("N" in value) || value.N === undefined || value.N === "") {
    return null;
  }

  const parsed = Number(value.N);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTelemetrySelectSql(
  startTimestamp: number,
  endTimestamp: number,
  limit: number,
  sessionId: number | undefined,
): string {
  const columns = TELEMETRY_COLUMNS.map(quoteIdentifier).join(", ");
  const filters = [
    `${quoteIdentifier("team_id")} = ${TEAM_ID_FILTER}`,
    `${quoteIdentifier("timestamp")} BETWEEN ${startTimestamp} AND ${endTimestamp}`,
  ];

  if (sessionId !== undefined) {
    filters.push(`${quoteIdentifier("session_id")} = ${sessionId}`);
  }

  return [
    `SELECT ${columns}`,
    `FROM ${getAthenaTableName()}`,
    `WHERE ${filters.join(" AND ")}`,
    `ORDER BY ${quoteIdentifier("timestamp")} ASC`,
    `LIMIT ${limit}`,
  ].join(" ");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function startAthenaQuery(sql: string): Promise<string> {
  const client = await getAthenaClient();
  const outputLocation = getRequiredEnv("SHARED_ATHENA_OUTPUT_LOCATION");

  console.log("Starting Athena telemetry query", { sql });

  const result = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
      WorkGroup: "primary",
    }),
  );

  if (!result.QueryExecutionId) {
    throw new Error("Athena did not return a QueryExecutionId");
  }

  return result.QueryExecutionId;
}

async function waitForAthenaQuery(queryExecutionId: string): Promise<void> {
  const client = await getAthenaClient();
  const timeoutMs = 25_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.send(
      new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }),
    );

    const status = result.QueryExecution?.Status;
    const state = status?.State;

    if (state === "SUCCEEDED") {
      console.log("Athena telemetry query succeeded", { queryExecutionId });
      return;
    }

    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(
        `Athena query ${queryExecutionId} ${state}: ${status?.StateChangeReason ?? "no failure reason provided"}`,
      );
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for Athena query ${queryExecutionId}`);
}

async function getAthenaRows(queryExecutionId: string): Promise<TelemetryRow[]> {
  const client = await getAthenaClient();
  const rows: TelemetryRow[] = [];
  let nextToken: string | undefined;
  let isFirstPage = true;

  do {
    const result = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        NextToken: nextToken,
      }),
    );

    const resultRows = result.ResultSet?.Rows ?? [];
    const dataRows = isFirstPage ? resultRows.slice(1) : resultRows;

    for (const row of dataRows) {
      rows.push(toTelemetryRow(row.Data?.map((cell) => cell.VarCharValue) ?? []));
    }

    nextToken = result.NextToken;
    isFirstPage = false;
  } while (nextToken);

  return rows;
}

function toTelemetryRow(values: Array<string | undefined>): TelemetryRow {
  return TELEMETRY_COLUMNS.reduce((row, column, index) => {
    const value = values[index];
    row[column] = value === undefined || value === "" ? null : Number(value);
    return row;
  }, {} as TelemetryRow);
}

async function getAthenaClient(): Promise<AthenaClient> {
  if (cachedAthenaClient && Date.now() < cachedAthenaClientExpiresAt - 60_000) {
    return cachedAthenaClient;
  }

  const assumeRoleResult = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: getRequiredEnv("SHARED_ROLE_ARN"),
      RoleSessionName: "hackathon-api-athena",
    }),
  );

  const credentials = assumeRoleResult.Credentials;

  if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
    throw new Error("STS AssumeRole did not return complete temporary credentials");
  }

  cachedAthenaClient = new AthenaClient({
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  });
  cachedAthenaClientExpiresAt = credentials.Expiration?.getTime() ?? Date.now() + 50 * 60_000;

  return cachedAthenaClient;
}

function getAthenaTableName(): string {
  const catalog = getRequiredEnv("ATHENA_CATALOG");
  const database = getRequiredEnv("ATHENA_DATABASE");
  const table = getRequiredEnv("TABLE_NAME");

  return `"s3tablescatalog/${catalog}".${database}.${table}`;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
