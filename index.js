var querystring = require('querystring'),
    Promise = require('bluebird'),
    request = require('request'),
    _ = require('lodash');

request.getAsync = Promise.promisify(request.get, {multiArgs: true});

/**
 * Adapter for bungie api
 *
 * @param {Object} options
 */
function BungieApi(options) {
  this.homeUrl = BungieApi.HOME_URL;
  this.debugUrl = this.homeUrl;
  this.destinyVersion = BungieApi.DESTINY_VERSION_1;

  this.configure(options);
}

/**
 * Service constants
 *
 * @type {String}
 */
BungieApi.HOME_URL = 'https://www.bungie.net/';
BungieApi.PARAMS_PATTERN = /:\w+/g;

/**
 * Special string to name the error
 *
 * @type {String}
 */
BungieApi.ERROR = 'bungie_error';

/**
 * Versions of destiny api
 *
 * @type {Number}
 */
BungieApi.DESTINY_VERSION_1 = 'v1';
BungieApi.DESTINY_VERSION_2 = 'v2';
BungieApi.DESTINY_VERSIONS = [
  BungieApi.DESTINY_VERSION_1,
  BungieApi.DESTINY_VERSION_2
];

/**
 * Pre-defined paths
 *
 * @type {Object}
 */
BungieApi.PATHS = {
  GET_GLOBAL_ALERTS: 'platform/GlobalAlerts',
  GET_BUNGIE_ACCOUNT: 'platform/User/GetBungieAccount/:membershipId/:membershipType',
  GET_MEMBERSHIP_DATA_BY_ID: 'platform/User/GetMembershipsById/:membershipId/:membershipType',
};
BungieApi.PATHS[BungieApi.DESTINY_VERSION_1] = {
  GET_DESTINY_MANIFEST: 'd1/platform/Destiny/Manifest',
  GET_ACCOUNT_SUMMARY: 'd1/platform/Destiny/:membershipType/Account/:membershipId/Summary',
  GET_ACTIVITY_HISTORY: 'd1/platform/Destiny/Stats/ActivityHistory/:membershipType/:membershipId/:characterId?mode=:mode',
  GET_CHARACTER_INVENTORY: 'd1/platform/Destiny/:membershipType/Account/:membershipId/Character/:characterId/Inventory',
  GET_HISTORICAL_STATS: 'd1/platform/Destiny/Stats/:membershipType/:membershipId/:characterId',
  GET_HISTORICAL_STATS_FOR_ACCOUNT: 'd1/platform/Destiny/Stats/Account/:membershipType/:membershipId',
  GET_POST_GAME_CARNAGE_REPORT: 'd1/platform/Destiny/Stats/PostGameCarnageReport/:activityId/',
  GET_PUBLIC_ADVISORS: 'd1/platform/Destiny/Advisors/',
  GET_PUBLIC_ADVISORS_V2: 'd1/platform/Destiny/Advisors/V2',
  GET_PUBLIC_VENDOR: 'd1/platform/Destiny/Vendors/:vendorId/',
  SEARCH_DESTINY_PLAYER: 'd1/platform/Destiny/SearchDestinyPlayer/:membershipType/:gamertag',
};
BungieApi.PATHS[BungieApi.DESTINY_VERSION_2] = {
  GET_DESTINY_MANIFEST: 'platform/Destiny2/Manifest',
  GET_PROFILE: 'platform/Destiny2/:membershipType/Profile/:membershipId',
  SEARCH_DESTINY_PLAYER: 'platform/Destiny2/SearchDestinyPlayer/:membershipType/:gamertag',
  GET_HISTORICAL_STATS: 'platform/Destiny2/:membershipType/Account/:membershipId/Character/:characterId/Stats',
  GET_HISTORICAL_STATS_FOR_ACCOUNT: 'platform/Destiny2/:membershipType/Account/:membershipId/Stats'
};

/**
 * Known error codes
 *
 * @type {Object}
 */
BungieApi.ERROR_CODES = {
  UNHANDLED_EXCEPTION: 3,
  MAINTENANCE: 5,
  THROTTLE_EXCEED: 51,
  INVALID_ACCOUNT: 1600,
  INVALID_ACCOUNT_2: 1601,
  NO_VENDOR: 1627,
  DESTINY_SHARD_RELAY_CLIENT_TIMEOUT: 1651,
  NO_ACTIVITY: 1653,
  LEGACY_ACCOUNT: 1670,
};

/**
 * Errors, that should result in empty data
 *
 * @type {Array}
 */
BungieApi.NO_DATA_ERRORS = [
  BungieApi.ERROR_CODES.INVALID_ACCOUNT,
  BungieApi.ERROR_CODES.INVALID_ACCOUNT_2,
  BungieApi.ERROR_CODES.NO_ACTIVITY,
  BungieApi.ERROR_CODES.NO_VENDOR
];

/**
 * Configure instance of bungie api
 *
 * @param {String} options
 */
BungieApi.prototype.configure = function(options) {
  options = options || {};
  if (options.apiKey) this.apiKey = options.apiKey;
  if (options.homeUrl) this.homeUrl = options.homeUrl;
  if (options.debugOn) this.debugOn = options.debugOn;
  if (options.debugUrl) this.debugUrl = options.debugUrl;

  if (options.destinyVersion &&
    BungieApi.DESTINY_VERSIONS.indexOf(options.destinyVersion) >= 0
  ) {
    this.destinyVersion = options.destinyVersion;
  }
};

/**
 * Make a request for given path
 *
 * @param {String} path
 * @param {Object} params
 * @return {Promise}
 */
BungieApi.prototype.request = function(path, params) {
  if (!path) throw new Error('No path specified');
  path = this.parsePath(path, _.clone(params || {}));

  return this.doRequest(path)
  .catch(function(err) {
    this.debug(err.message);

    var bungieErr = new Error(BungieApi.ERROR);
    bungieErr.originalErr = err;
    if (err.code) bungieErr.code = err.code;

    throw bungieErr;
  }.bind(this));
};

/**
 * @param {String} path
 * @return {Promise}
 * @private
 */
BungieApi.prototype.doRequest = function(path) {
  this.debug('request: ' + this.debugUrl + path);

  return request.getAsync({
    url: this.homeUrl + path,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10)' +
        ' AppleWebKit/600.1.25 (KHTML, like Gecko) Version/8.0 Safari/600.1.25',
      'X-Requested-With': 'XMLHttpRequest',
      'X-API-Key': this.getApiKey(),
      'Accept-Language': 'en-us',
      'Connection': 'keep-alive'
    },
    forever: true
  })
  .spread(function(response, body) {
    if (response.statusCode == 404) {
      return null; // not found = empty response
    } else if (response.statusCode != 200) {
      var statusError = new Error('INVALID_STATUS_CODE');
      statusError.code = response.statusCode;
      throw statusError;
    }

    var data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      throw new Error('Failed to parse response');
    }

    if (data.ErrorStatus != 'Success') {
      if (BungieApi.NO_DATA_ERRORS.indexOf(data.ErrorCode) >= 0) return null;

      var dataError = new Error(body);
      dataError.code = data.ErrorCode;
      throw dataError;
    }

    return data.Response;
  })
  .catch(function(err) {
    err.originalMessage = err.message;
    err.message = this.homeUrl + path + ' failed: ' + err.message;
    throw err;
  }.bind(this));
};

/**
 * @param {String} path
 * @param {Object} params
 * @private
 */
BungieApi.prototype.parsePath = function(path, params) {
  var version = params.destinyVersion || this.destinyVersion;
  if (!BungieApi.PATHS[path] && !BungieApi.PATHS[version][path]) return path;

  delete params.destinyVersion;
  path = BungieApi.PATHS[version][path] || BungieApi.PATHS[path];
  var placeholders = path.match(BungieApi.PARAMS_PATTERN);
  if (placeholders) {
    placeholders.forEach(function(field) {
      field = field.substring(1);
      if (!params[field]) throw new Error('Missing value for :' + field);
      try {
        path = path.replace(':' + field, encodeURIComponent(params[field]));
      } catch (err) { /* some weird utf error */ }
      delete params[field];
    });
  }

  var query = querystring.stringify(params);
  if (query) {
    if (path.indexOf('?') > 0) {
      path += '&' + query;
    } else {
      path += '?' + query;
    }
  }

  return path;
};

/**
 * @return {String}
 * @private
 */
BungieApi.prototype.getApiKey = function() {
  if (!this.apiKey) throw new Error('Bungie API key is not defined');
  return this.apiKey;
};

/**
 * Delayed debug require, to make time for in-app modifications of environment
 *
 * @param {String} message
 * @private
 */
var logger;
BungieApi.prototype.debug = function(message) {
  if (!this.debugOn) return;

  if (!logger) {
    var debug = require('debug');
    debug.enable('*bungie-api*');
    logger = debug('bungie-api');
  }

  logger(message);
};

module.exports = new BungieApi();
module.exports.BungieApi = BungieApi;
module.exports.HOME_URL = BungieApi.HOME_URL;
module.exports.ERROR = BungieApi.ERROR;
module.exports.ERROR_CODES = BungieApi.ERROR_CODES;
module.exports.ERROR_NAMES = _.invert(BungieApi.ERROR_CODES);
module.exports.DESTINY_VERSION_1 = BungieApi.DESTINY_VERSION_1;
module.exports.DESTINY_VERSION_2 = BungieApi.DESTINY_VERSION_2;
