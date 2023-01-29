/*
  This would be our downstream Lambda function that is interested in "value2 changed" events.
  We don't actually have any logic, so for now we'll just print out the event to show we got it.
*/

exports.handler = async function (event) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
};
