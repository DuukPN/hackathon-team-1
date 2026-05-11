import type { SQSEvent } from "aws-lambda";

export const handler = async (event: SQSEvent) => {
  console.log("Received SQS event with", event.Records.length, "messages");

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      console.log("Processing message:", JSON.stringify(body).slice(0, 200));

      // TODO: Process and store the incoming data
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  return { statusCode: 200, message: "Batch processed successfully" };
};
