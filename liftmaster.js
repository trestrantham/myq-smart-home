var axios = require('axios');

var baseURL = 'https://myqexternal.myqdevice.com/api/v4';

// App ID for the offical Liftmaster app
var appId = 'NWknvuBd7LoFHfXmKNMBcgajXtZEgKUh4V7WNzMidrpUUluDpVYVZx+xT4PCM5Kx';

var headers = {
  ApiVersion: "4.1",
  BrandId: "2",
  Culture: "en",
  MyQApplicationId: appId,
};

var config = {
  headers: headers,
  baseURL: baseURL,
};

function login(username, password) {
  var payload = {
    username: username,
    password: password,
  };

  return axios.post('/user/validate', payload, config);
}

function getDevices(authToken) {
  var params = {
    securityToken: authToken,
  };

  return axios.get('/userdevicedetails/get', Object.assign(config, { params: params }));
}

function getDoorState(authToken, deviceId) {
  var params = {
    AttributeName: 'doorstate',
    MyQDeviceId: deviceId,
    SecurityToken: authToken,
  };

  return axios.get('/DeviceAttribute/GetDeviceAttribute', Object.assign(config, { params: params }));
}

function setDoorState(authToken, deviceId, doorState) {
  var params = {
    appId: appId,
    SecurityToken: authToken,
  };

  var payload = {
    AttributeName: "desireddoorstate",
    AttributeValue: doorState,
    MyQDeviceId: deviceId,
    SecurityToken: authToken,
  };

  return axios.put('/DeviceAttribute/PutDeviceAttribute', payload, Object.assign(config, { params: params }));
}

module.exports = {
  login,
  getDevices,
  getDoorState,
  setDoorState,
};
