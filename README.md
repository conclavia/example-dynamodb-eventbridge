# DynamoDB => EventBridge => Lambda

This is a quick-and-dirty example wiring up a DynamoDB event stream to AWS EventBridge using the AWS CDK.

It deploys:

- DynamoDB table with event stream
- Custom EventBridge Event Bus
- "Stream" Lambda Function that listens to the event stream and forwards events to our bus
- EventBridge rule to filter events where the "value2" field changes
- "Target" downstream Lambda function that listens for events from our rule and prints them out

The code is not Production-ready and should be used for demonstration purposes only.
