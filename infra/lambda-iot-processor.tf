data "archive_file" "iot_processor" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/iot-processor/dist/index.js"
  output_path = "${path.module}/.build/iot-processor.zip"
}

resource "aws_lambda_function" "iot_processor" {
  function_name    = "hackathon-iot-processor"
  role             = aws_iam_role.iot_processor.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.iot_processor.output_path
  source_code_hash = data.archive_file.iot_processor.output_base64sha256
  timeout          = 60
}

resource "aws_iam_role" "iot_processor" {
  name = "hackathon-iot-processor-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "iot_processor_logs" {
  role       = aws_iam_role.iot_processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "iot_processor_sqs" {
  name = "hackathon-iot-processor-sqs"
  role = aws_iam_role.iot_processor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Effect   = "Allow"
        Resource = aws_sqs_queue.telemetry_messages.arn
      }
    ]
  })
}

# SQS Queue for telemetry messages
resource "aws_sqs_queue" "telemetry_messages" {
  name                       = "telemetry_messages"
  message_retention_seconds  = 345600
  visibility_timeout_seconds = 60
}

# IAM role for IoT Topic Rule to write to SQS
resource "aws_iam_role" "iot_topic_rule" {
  name = "hackathon-iot-topic-rule-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "iot.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "iot_topic_rule_sqs" {
  name = "hackathon-iot-topic-rule-sqs"
  role = aws_iam_role.iot_topic_rule.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sqs:SendMessage"
        ]
        Effect   = "Allow"
        Resource = aws_sqs_queue.telemetry_messages.arn
      }
    ]
  })
}

# Event source mapping: SQS queue triggers Lambda
resource "aws_lambda_event_source_mapping" "sqs_to_lambda" {
  event_source_arn = aws_sqs_queue.telemetry_messages.arn
  function_name    = aws_lambda_function.iot_processor.function_name
  batch_size       = 10
}
