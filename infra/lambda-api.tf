data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/api/dist/index.js"
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_lambda_function" "api" {
  function_name    = "hackathon-api"
  role             = aws_iam_role.api.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 30
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      ATHENA_CATALOG                = var.athena_catalog
      ATHENA_DATABASE               = "telemetry"
      TABLE_NAME                    = "telemetry"
      SHARED_ROLE_ARN               = var.shared_role_arn
      SHARED_ATHENA_OUTPUT_LOCATION = var.shared_athena_output_location
      DYNAMODB_TABLE_NAME           = aws_dynamodb_table.telemetry.name
    }
  }
}

resource "aws_iam_role" "api" {
  name = "hackathon-api-role"

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

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_assume_shared" {
  name = "hackathon-api-assume-shared"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "sts:AssumeRole"
        Effect   = "Allow"
        Resource = var.shared_role_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_dynamodb" {
  name = "hackathon-api-dynamodb"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:Query"
        ]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.telemetry.arn
      }
    ]
  })
}

resource "aws_apigatewayv2_api" "api" {
  name          = "hackathon-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["http://localhost:5173", "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"]
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["Content-Type"]
  }
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api_hello" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
