/*
  An example Lambda function that receives DynamoDB stream events, enriches them with a list
  of changed fields and publishes them out to our custom EventBridge event bus.
*/

const AWS = require("aws-sdk");
const events = new AWS.CloudWatchEvents({ apiVersion: "2015-10-07" });

/*
  Basic array chunking function borrowed from StackOverflow.
*/
function chunk(arr, len) {
  var chunks = [],
    i = 0,
    n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, (i += len)));
  }

  return chunks;
}

/*
  EventBridge doesn't offer a matcher for comparing two fields in an event to see if they are different,
  which limits the usefulness of rules built against raw DynamoDB stream events.

  To work around this we'll need compare the old and new images ourselves to see what fields have changed
  and add this list to the record.

  For this example, the implementation only supports a single level of fields that are all strings.
  A real system would need to handle nested fields and different data types, but then again a real system
  would be built with real money and have a real build chain that supports real third-party packages.
*/
function getChangedFields(record) {
  const oldKeys = Object.keys(record.dynamodb.OldImage || {});
  const newKeys = Object.keys(record.dynamodb.NewImage || {});

  if (record.eventName === "INSERT") {
    return newKeys;
  }

  if (record.eventName === "REMOVE") {
    return oldKeys;
  }

  return oldKeys
    .concat(newKeys)
    .filter((value, index, self) => self.indexOf(value) === index)
    .filter(
      (value) =>
        !newKeys.includes(value) ||
        !oldKeys.includes(value) ||
        record.dynamodb.OldImage[value].S !== record.dynamodb.NewImage[value].S
    );
}

exports.handler = async function (event) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  return Promise.all(
    /*
      PutEvents only supports 10 items per request, while Lambda event source mapping can deliver up to 10K
      per invocation. For this example we'll split the array into chunks for delivery... and then naively fire
      them all off at once :-)

      If you're using this in Production then please accommodate the applicable throttle limits.

      https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html
    */
    chunk(event.Records, 10).map((b) =>
      events
        .putEvents({
          Entries: b.map((e) => ({
            // We'd obviously pass this in as an environment variable or whatever
            EventBusName: "data-change-events",
            // The ummm.... data... changed? Naming generic stuff is hard ¯\_(ツ)_/¯
            DetailType: "data-change",
            // Probably the name of the app/component that owns this data
            Source: "my.app.name.here",
            // Put our list of changed fields into the detail along with the original event
            Detail: JSON.stringify({
              ...e,
              ...{ changedFields: getChangedFields(e) },
            }),
          })),
        })
        .promise()
    )
  );
};
