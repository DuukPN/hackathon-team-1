resource "aws_dynamodb_table" "telemetry" {
  name           = "telemetry"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "team_id"
  range_key      = "timestamp"

  attribute {
    name = "team_id"
    type = "N"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }
}
