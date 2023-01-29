import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { Duration } from "aws-cdk-lib";

export class EventbridgeDynamodbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /*
      The table we want to publish events from.
    */
    const table = new dynamodb.Table(this, "DynamoTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const streamFn = new lambda.Function(this, "StreamFunction", {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "..", "src", "stream-lambda")
      ),
    });

    table.grantStreamRead(streamFn.grantPrincipal);

    /*
      This function will enrich the events with some additional derived fields
      and publish them out to EventBridge.
    */
    streamFn.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        bisectBatchOnError: true,
        maxRecordAge: Duration.hours(24),
        retryAttempts: 10,
      })
    );

    /*
      We'll use a custom event bus just to keep things tidy.
    */
    const bus = new events.EventBus(this, "EventBus", {
      eventBusName: "data-change-events",
    });

    bus.grantPutEventsTo(streamFn.grantPrincipal);

    /*
      An example downstream function that is only interested in events where the value2 field changed.
    */
    const target1Fn = new lambda.Function(this, "Target1Function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "..", "src", "target-lambda")
      ),
    });

    /*
      Look for any events where the value of the "value2" field has changed.
    */
    const rule1 = new events.Rule(this, "Target1FunctionRule", {
      eventBus: bus,
      eventPattern: {
        detailType: ["data-change"],
        detail: { changedFields: ["value2"] },
      },
    });

    rule1.addTarget(new targets.LambdaFunction(target1Fn));

    /*
      An example downstream function that is only interested in customers being added/deleted (but not updated).
    */
    const target2Fn = new lambda.Function(this, "Target2Function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "..", "src", "target-lambda")
      ),
    });

    /*
      Look for any INSERT or REMOVE events where the id prefix indicates a customer record.
    */
    const customerPrefix = "customer-";

    const rule2 = new events.Rule(this, "Target2FunctionRule", {
      eventBus: bus,
      eventPattern: {
        detailType: ["data-change"],
        detail: {
          eventName: ["INSERT", "REMOVE"],
          dynamodb: {
            $or: [
              {
                NewImage: { id: { S: events.Match.prefix(customerPrefix) } },
              },
              {
                OldImage: { id: { S: events.Match.prefix(customerPrefix) } },
              },
            ],
          },
        },
      },
    });

    rule2.addTarget(new targets.LambdaFunction(target2Fn));
  }
}
