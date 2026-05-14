import {
  AthenaClient,
  GetQueryExecutionCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

const stsClient = new STSClient();

// Cache the Athena client between warm Lambda invocations so we do not call STS for every message.
let cachedAthenaClient: AthenaClient | undefined;
let cachedAthenaClientExpiresAt = 0;

// These are the exact columns in the single S3 Tables/Athena telemetry table.
// The order matters because buildInsertSql uses this list for the INSERT column order.
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
  "abs_orientation_w",
] as const;

// ColumnName is the union of all valid table column names.
// This keeps the TypeScript storage type synchronized with TELEMETRY_COLUMNS.
type ColumnName = (typeof TELEMETRY_COLUMNS)[number];

// This is the JSON shape the tracking box should publish to MQTT.
// Because the table is one flat table, the Lambda expects one flat JSON object per MQTT message.
type MqttTelemetryMessage = {
  // GPS fields.
  timestamp: number;
  team_id: number;
  session_id: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  satellites: number;
  gps_timestamp: number;

  // Raw IMU fields.
  acc_x: number;
  acc_y: number;
  acc_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  mag_x: number;
  mag_y: number;
  mag_z: number;

  // BNO055 calibration status fields. Valid values are 0, 1, 2, or 3.
  status_mag: CalibrationStatus;
  status_gyro: CalibrationStatus;
  status_acc: CalibrationStatus;
  status_sys: CalibrationStatus;

  // Additional IMU/environment fields.
  temperature: number;
  gravity_x: number;
  gravity_y: number;
  gravity_z: number;
  abs_orientation_x: number;
  abs_orientation_y: number;
  abs_orientation_z: number;
  abs_orientation_w: number;
  linear_acc_x: number;
  linear_acc_y: number;
  linear_acc_z: number;
};

// Calibration statuses come from the IMU as integer quality levels.
type CalibrationStatus = 0 | 1 | 2 | 3;

// This is the normalized row shape that will be inserted into the S3 Tables/Athena table.
// It intentionally matches MqttTelemetryMessage because the table schema is already flat.
type TelemetryStorageRow = Record<ColumnName, number>;

// =============================================================================
// TEST-ONLY DUMMY ROW
// =============================================================================
// Set INSERT_DUMMY_TELEMETRY_ROW=true on the Lambda environment to insert this
// generated row and return before processing SQS messages. This is only for
// manually testing the Athena connection and INSERT path.
const INSERT_DUMMY_TELEMETRY_ROW_ENV = "INSERT_DUMMY_TELEMETRY_ROW";

function createDummyTelemetryRow(): TelemetryStorageRow {
  const now = Date.now();

  return {
    timestamp: now,
    team_id: 1,
    session_id: 999,
    latitude: 52.3888,
    longitude: 4.5409,
    altitude: 8.5,
    speed: 42.3,
    course: 180,
    satellites: 10,
    gps_timestamp: now - 100,
    acc_x: 0.11,
    acc_y: -0.04,
    acc_z: 9.79,
    gyro_x: 0.01,
    gyro_y: 0.02,
    gyro_z: 0.03,
    mag_x: 12.4,
    mag_y: -3.2,
    mag_z: 41.8,
    status_mag: 3,
    status_gyro: 3,
    status_acc: 3,
    status_sys: 3,
    pitch_rate: 0.01,
    roll_rate: 0.02,
    yaw_rate: 0.03,
    pitch_angle: 0.12,
    roll_angle: -0.08,
    yaw_angle: 1.57,
    temperature: 24.5,
    gravity_x: 0.01,
    gravity_y: -0.02,
    gravity_z: 9.8,
    abs_orientation_x: 0.12,
    abs_orientation_y: -0.08,
    abs_orientation_z: 1.57,
    abs_orientation_w: 1.57,
    linear_acc_x: 0.02,
    linear_acc_y: 0.01,
    linear_acc_z: -0.03,
  };
}

// Lambda entrypoint. SQS batches multiple MQTT messages into one invocation.
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log("Received SQS event with", event.Records.length, "messages");

  if (process.env[INSERT_DUMMY_TELEMETRY_ROW_ENV] === "true") {
    console.log("Inserting dummy telemetry row because test mode is enabled");
    console.log("we are now not inserting the rows for dummy values to not ddos :))x")
    // await writeTelemetryRows([createDummyTelemetryRow()]);
    return { batchItemFailures: [] };
  }

  // Returning only failed message IDs lets SQS retry bad messages without replaying successful ones.
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];
  const rowsToInsert: TelemetryStorageRow[] = [];
  const recordIdsToInsert: string[] = [];

  for (const record of event.Records) {
    try {
      // Convert the SQS record body into the incoming MQTT message type.
      const mqttMessage = parseTelemetryRecord(record);

      // Convert the incoming MQTT shape into the storage/table shape.
      const storageRow = toStorageRow(mqttMessage);

      // Keep the row and source message ID together so the whole insert can be retried if Athena fails.
      rowsToInsert.push(storageRow);
      recordIdsToInsert.push(record.messageId);
    } catch (error) {
      console.error("Failed to process telemetry message", {
        messageId: record.messageId,
        body: record.body,
        error,
      });

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  try {
    // Store all valid records from this SQS batch in one Athena INSERT.
    await writeTelemetryRows(rowsToInsert);
  } catch (error) {
    console.error("Failed to insert telemetry batch", {
      messageIds: recordIdsToInsert,
      rowCount: rowsToInsert.length,
      error,
    });

    for (const messageId of recordIdsToInsert) {
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};

// Parse the JSON body that came from SQS and validate it before using it as telemetry data.
function parseTelemetryRecord(record: SQSRecord): MqttTelemetryMessage {
  const parsed: unknown = JSON.parse(record.body);
  assertTelemetryMessage(parsed);
  return parsed;
}

// Runtime validation matters because TypeScript types do not protect Lambda from malformed MQTT JSON.
function assertTelemetryMessage(value: unknown): asserts value is MqttTelemetryMessage {
  if (!isObject(value)) {
    throw new Error("Telemetry message must be a JSON object");
  }

  // Validate GPS/table identity fields.
  assertEpochMilliseconds(value.timestamp, "timestamp");
  assertInteger(value.team_id, "team_id");
  assertInteger(value.session_id, "session_id");
  assertNumber(value.latitude, "latitude");
  assertNumber(value.longitude, "longitude");
  assertNumber(value.altitude, "altitude");
  assertNumber(value.speed, "speed");
  assertInteger(value.course, "course");
  assertInteger(value.satellites, "satellites");
  assertEpochMilliseconds(value.gps_timestamp, "gps_timestamp");

  // Validate raw IMU fields.
  assertNumber(value.acc_x, "acc_x");
  assertNumber(value.acc_y, "acc_y");
  assertNumber(value.acc_z, "acc_z");
  assertNumber(value.gyro_x, "gyro_x");
  assertNumber(value.gyro_y, "gyro_y");
  assertNumber(value.gyro_z, "gyro_z");
  assertNumber(value.mag_x, "mag_x");
  assertNumber(value.mag_y, "mag_y");
  assertNumber(value.mag_z, "mag_z");

  // Validate calibration status fields.
  assertCalibrationStatus(value.status_mag, "status_mag");
  assertCalibrationStatus(value.status_gyro, "status_gyro");
  assertCalibrationStatus(value.status_acc, "status_acc");
  assertCalibrationStatus(value.status_sys, "status_sys");

  // Validate additional IMU/environment fields.
  assertNumber(value.temperature, "temperature");
  assertNumber(value.gravity_x, "gravity_x");
  assertNumber(value.gravity_y, "gravity_y");
  assertNumber(value.gravity_z, "gravity_z");
  assertNumber(value.abs_orientation_x, "abs_orientation_x");
  assertNumber(value.abs_orientation_y, "abs_orientation_y");
  assertNumber(value.abs_orientation_z, "abs_orientation_z");
  assertNumber(value.abs_orientation_w, "abs_orientation_w");
  assertNumber(value.linear_acc_x, "linear_acc_x");
  assertNumber(value.linear_acc_y, "linear_acc_y");
  assertNumber(value.linear_acc_z, "linear_acc_z");
}

// Transform incoming MQTT JSON into one flat storage row.
function toStorageRow(message: MqttTelemetryMessage): TelemetryStorageRow {
  let qx = message.abs_orientation_x
  let qy = message.abs_orientation_y
  let qz = message.abs_orientation_z
  let qw = message.abs_orientation_w

  let yaw = Math.atan2(2 * qy * qw - 2 * qx * qz , 1 - 2 * qy * qy - 2 * qz * qz)
  let pitch = Math.asin(2 * qx * qy + 2 * qz * qw)
  let roll = Math.atan2(2 * qx * qw - 2 * qy * qz , 1 - 2 * qx * qx - 2 * qz * qz)

  return {
    timestamp: message.timestamp,
    team_id: message.team_id,
    session_id: message.session_id,
    latitude: message.latitude,
    longitude: message.longitude,
    altitude: message.altitude,
    speed: message.speed,
    course: message.course,
    satellites: message.satellites,
    gps_timestamp: message.gps_timestamp,
    acc_x: message.acc_x,
    acc_y: message.acc_y,
    acc_z: message.acc_z,
    gyro_x: message.gyro_x,
    gyro_y: message.gyro_y,
    gyro_z: message.gyro_z,
    mag_x: message.mag_x,
    mag_y: message.mag_y,
    mag_z: message.mag_z,
    status_mag: message.status_mag,
    status_gyro: message.status_gyro,
    status_acc: message.status_acc,
    status_sys: message.status_sys,
    pitch_rate: 0,
    roll_rate: 0,
    yaw_rate: 0,
    pitch_angle: pitch,
    roll_angle: roll,
    yaw_angle: yaw,
    temperature: message.temperature,
    gravity_x: message.gravity_x,
    gravity_y: message.gravity_y,
    gravity_z: message.gravity_z,
    abs_orientation_x: message.abs_orientation_x,
    abs_orientation_y: message.abs_orientation_y,
    abs_orientation_z: message.abs_orientation_z,
    abs_orientation_w: message.abs_orientation_w,
    linear_acc_x: message.linear_acc_x,
    linear_acc_y: message.linear_acc_y,
    linear_acc_z: message.linear_acc_z,
  };
}

// This is the storage boundary for a telemetry batch.
async function writeTelemetryRows(rows: TelemetryStorageRow[]): Promise<void> {
  if (rows.length === 0) {
    console.log("No valid telemetry rows to insert");
    return;
  }

  const sql = buildInsertSql(rows);
  console.log("Prepared telemetry batch insert", { rowCount: rows.length, sql });
  await runAthenaQuery(sql);
}

// Build the INSERT statement for the shared Athena/S3 Tables table.
function buildInsertSql(rows: TelemetryStorageRow[]): string {
  const tableName = getAthenaTableName();
  const columns = TELEMETRY_COLUMNS.map(quoteIdentifier).join(", ");
  const values = rows.map((row) => `(${buildSqlValueList(row)})`).join(", ");

  return `INSERT INTO ${tableName} (${columns}) VALUES ${values}`;
}

// Quote column names so names like timestamp are handled as identifiers in Athena SQL.
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

// Build the SQL value list for one row, without the surrounding parentheses.
function buildSqlValueList(row: TelemetryStorageRow): string {
  return TELEMETRY_COLUMNS.map((column) => toSqlValue(row[column])).join(", ");
}

// Build the fully-qualified Athena table path required by the shared S3 Tables catalog.
function getAthenaTableName(): string {
  const catalog = getRequiredEnv("ATHENA_CATALOG");
  const database = getRequiredEnv("ATHENA_DATABASE");
  const table = getRequiredEnv("TABLE_NAME");

  return `"s3tablescatalog/${catalog}".${database}.${table}`;
}

// Run one Athena query and wait until Athena reports that it finished.
async function runAthenaQuery(sql: string): Promise<void> {
  const client = await getAthenaClient();
  const outputLocation = getRequiredEnv("SHARED_ATHENA_OUTPUT_LOCATION");

  // StartQueryExecution returns immediately; Athena runs the INSERT asynchronously.
  const startResult = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
      WorkGroup: "primary",
    }),
  );

  const queryExecutionId = startResult.QueryExecutionId;

  if (!queryExecutionId) {
    throw new Error("Athena did not return a QueryExecutionId");
  }

  await waitForAthenaQuery(client, queryExecutionId);
}

// Create an Athena client using temporary credentials from the shared account role.
async function getAthenaClient(): Promise<AthenaClient> {
  // Refresh a little before expiration so a warm Lambda does not reuse expired STS credentials.
  if (cachedAthenaClient && Date.now() < cachedAthenaClientExpiresAt - 60_000) {
    return cachedAthenaClient;
  }

  const roleArn = getRequiredEnv("SHARED_ROLE_ARN");

  // The Lambda role in this account is allowed by Terraform to assume this shared-account writer role.
  const assumeRoleResult = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "hackathon-iot-processor-athena",
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

// Poll Athena until the query succeeds or fails.
async function waitForAthenaQuery(client: AthenaClient, queryExecutionId: string): Promise<void> {
  const timeoutMs = 45_000;
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
      console.log("Athena insert succeeded", { queryExecutionId });
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

// Sleep between Athena polling attempts so the Lambda does not hot-loop.
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Convert numeric values into SQL literals for Athena.
function toSqlValue(value: number): string {
  return String(value);
}

// Read required Lambda environment variables with an explicit error when Terraform did not set one.
function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Narrow unknown JSON into an object that can be inspected safely.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Validate a required numeric field.
function assertNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Telemetry ${fieldName} must be a finite number`);
  }
}

// Validate a required integer field.
function assertInteger(value: unknown, fieldName: string): asserts value is number {
  assertNumber(value, fieldName);

  if (!Number.isInteger(value)) {
    throw new Error(`Telemetry ${fieldName} must be an integer`);
  }
}

// Validate an epoch millisecond timestamp.
function assertEpochMilliseconds(value: unknown, fieldName: string): asserts value is number {
  assertInteger(value, fieldName);

  if (value < 0) {
    throw new Error(`Telemetry ${fieldName} must be a positive epoch millisecond timestamp`);
  }
}

// Validate BNO055 calibration status values.
function assertCalibrationStatus(value: unknown, fieldName: string): asserts value is CalibrationStatus {
  assertInteger(value, fieldName);

  if (value < 0 || value > 3) {
    throw new Error(`Telemetry ${fieldName} must be 0, 1, 2, or 3`);
  }
}
