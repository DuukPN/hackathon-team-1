resource "aws_iot_thing" "tracking_box" {
  name = "tracking-box"
}

resource "aws_iot_policy" "tracking_box" {
  name = "tracking-box-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "iot:Connect"
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "iot:Publish"
        Resource = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/tracking-box/data"
      }
    ]
  })
}

# TODO: Add an IoT Topic Rule here that forwards messages from the MQTT topic to the SQS queue.
#
# An IoT Topic Rule listens to an MQTT topic and routes matching messages to an AWS service.
# In this case, you want to route messages from the tracking box to the SQS queue,
# which will then trigger the IoT processor Lambda.
#
# You need to create an "aws_iot_topic_rule" resource with:
#   - A SQL query that selects messages from the right MQTT topic
#   - An SQS action that sends the message to: aws_sqs_queue.telemetry_messages.url
#   - The IAM role: aws_iam_role.iot_topic_rule.arn (already defined in lambda-iot-processor.tf)
#
# Docs: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iot_topic_rule
# IoT SQL reference: https://docs.aws.amazon.com/iot/latest/developerguide/iot-sql-reference.html
