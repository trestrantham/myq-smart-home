var Liftmaster = require('liftmaster');

var doorStates = {
  open: 1,
  closed: 2,
  opening: 4,
  closing: 5,
};
var validMyQDeviceTypeIds = [17];

// Main entry point.
// Incoming events from Alexa APIs are processed via this method.
exports.handler = function(event, context) {
  log('Input', event);

  switch (event.header.namespace) {
    // The namespace of "Discovery" indicates a request is being made to the lambda for
    // discovering all appliances associated with the customer's appliance cloud account.
    // can use the accessToken that is made available as part of the payload to determine
    // the customer.
    case 'Alexa.ConnectedHome.Discovery':
      handleDiscovery(event, context);
      break;

    // The namespace of "Control" indicates a request is being made to us to turn a
    // given device on, off or brighten. This message comes with the "appliance"
    // parameter which indicates the appliance that needs to be acted on.
    case 'Alexa.ConnectedHome.Control':
      handleControl(event, context);
      break;

    // We received an unexpected message
    default:
      log('Err', 'No supported namespace: ' + event.header.namespace);
      context.fail('Something went wrong');
      break;
  }
};

// This method is invoked when we receive a "Discovery" message from Alexa Connected Home Skill.
// We are expected to respond back with a list of appliances that we have discovered for a given
// customer.
function handleDiscovery(event, context) {
  // Login to MyQ to get the authToken on every request
  Liftmaster.login(process.env.MYQ_USERNAME, process.env.MYQ_PASSWORD)
    .then(function(response) {
      var authToken = response.data.SecurityToken;
      var messageId = event.header.messageId;

      // Response body will be an array of discovered devices.
      var appliances = [];

      Liftmaster.getDevices(authToken)
        .then(function(response) {
          var devices = response.data.Devices;

          devices
            .filter(function(device) {
              return validMyQDeviceTypeIds.indexOf(device.MyQDeviceTypeId) !== -1;
            })
            .map(function(device, index) {
              var descAttribute = findAttribute(device, 'desc');
              var nameAttribute = findAttribute(device, 'name');
              var onlineAttribute = findAttribute(device, 'online');

              var garageDoor = {
                applianceId: device.MyQDeviceId,
                manufacturerName: 'Liftmaster',
                modelName: nameAttribute.Value,
                version: 'VER01',
                friendlyName: descAttribute.Value,
                friendlyDescription: descAttribute.Value,
                isReachable: onlineAttribute.Value === 'True',
                actions:[
                  "turnOn",
                  "turnOff",
                ],
                additionalApplianceDetails: {
                  // OPTIONAL:
                  // We can use this to persist any appliance specific metadata.
                  // This information will be returned back to the driver when user requests
                  // action on this appliance.
                  deviceId: device.MyQDeviceId,
                }
              };

              appliances.push(garageDoor);
            });

          // Crafting the response header
          var headers = {
            messageId: messageId,
            namespace: 'Alexa.ConnectedHome.Discovery',
            name: 'DiscoverAppliancesResponse',
            payloadVersion: '2'
          };

          // Craft the final response back to Alexa Connected Home Skill. This will include all the
          // discovered appliances.
          var payloads = {
            discoveredAppliances: appliances,
          };

          var result = {
            header: headers,
            payload: payloads,
          };

          context.succeed(result);
      })
      .catch(function(error) {
        logError(error, 'Liftmaster.getDevices');
        context.fail('There was a problem discovering your devices');
      });
    })
    .catch(function(error) {
      logError(error, 'Liftmaster.login');
      context.fail('Could not log in to your account');
    });
}

// Control events are processed here.
// This is called when Alexa requests an action (IE turn off appliance).
function handleControl(event, context) {
  log('handleControl event:', event);
  if (event.header.namespace === 'Alexa.ConnectedHome.Control') {

    // Login to MyQ to get the authToken on every request
    Liftmaster.login(process.env.MYQ_USERNAME, process.env.MYQ_PASSWORD)
      .then(function(response) {
        var authToken = response.data.SecurityToken;

        // Retrieve the appliance id and accessToken from the incoming message.
        var applianceId = event.payload.appliance.applianceId;
        var deviceId = event.payload.appliance.additionalApplianceDetails.deviceId;
        var messageId = event.header.messageId;

        var state = 0;
        var confirmation;

        if(event.header.name == "TurnOnRequest") {
          state = 1;
          confirmation = "TurnOnConfirmation";
        }
        else if(event.header.name == "TurnOffRequest") {
          state = 0;
          confirmation = "TurnOffConfirmation";
        }

        Liftmaster.setDoorState(authToken, deviceId, state)
          .then(function(response) {
            var headers = {
              namespace: 'Alexa.ConnectedHome.Control',
              name: confirmation,
              payloadVersion: '2',
              messageId: messageId,
            };
            var result = {
              header: headers,
              payload: {},
            };

            context.succeed(result);
          })
          .catch(function(error) {
            logError(error, 'Liftmaster.getDoorState');
            context.fail(controlError(event, 'DependentServiceUnavailableError'));
          });
      })
      .catch(function(error) {
        logError(error, 'Liftmaster.login');
        context.fail('Could not log in to your account');
      });
  }
}

/**
 * Utility functions.
 */
function log(title, msg) {
  console.log(title + ": " + JSON.stringify(msg));
}

function logError(error, prefix) {
  prefix = prefix ? prefix : 'Error';

  if (error.response) {
    // The request was made, but the server responded with a status code
    // that falls out of the range of 2xx
    console.log(prefix + ': ' + JSON.stringify(error.response.data));
    console.log(prefix + ': ' + error.response.status);
    console.log(prefix + ': ' + JSON.stringify(error.response.headers));
  } else {
    // Something happened in setting up the request that triggered an Error
    console.log(prefix + ': ', error.message);
  }

  console.log(prefix + ': ' + JSON.stringify(error.config));
}

function findAttribute(device, attributeName) {
  device.Attributes.find(function(attribute) {
    return attribute.AttributeDisplayName === attributeName;
  });
}

function controlError(event, name) {
  var headers = {
    namespace: 'Alexa.ConnectedHome.Control',
    name: name,
    payloadVersion: '2',
    messageId: event.header.messageId,
  };

  var payload = {};

  switch (name) {
    case 'DependentServiceUnavailableError':
      payload = {
        dependentServiceName: 'Liftmaster MyQ',
      };
      break;
    case 'NotSupportedInCurrentModeError':
      payload = {
        currentDeviceMode: 'OTHER',
      };
      break;
  }

  var result = {
    header: headers,
    payload: payload
  };

  return result;
}
