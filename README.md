# DynamoDB => EventBridge => Lambda

This is a quick-and-dirty example wiring up a DynamoDB event stream to AWS EventBridge using the AWS CDK.

It deploys:

- DynamoDB table with event stream
- Custom EventBridge Event Bus
- "Stream" Lambda Function that listens to the event stream and forwards events to our bus
- Two "Target" downstream Lambda functions with EventBridge rules filtering for specific types of events:
  1. Target1 listens for events where the "value2" field changes
  1. Target2 listens for customer records being created or deleted

The code is not Production-ready and should be used for demonstration purposes only.
