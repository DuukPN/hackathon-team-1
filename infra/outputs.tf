output "api_url" {
  value       = aws_apigatewayv2_api.api.api_endpoint
  description = "API Gateway URL (use as VITE_API_URL)"
}

output "frontend_url" {
  value       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
  description = "Frontend website URL"
}
