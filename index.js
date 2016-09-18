var querystring = require('querystring'),
    Promise = require('bluebird'),
    request = Promise.promisifyAll(require('request'), {multiArgs: true}),
    _ = require('lodash'),
    debug = require('debug')('bungie-api');

/**
 * Adapter for bungie api
 *
 * @param {Object} options
 */
function BungieApi(options) {
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
 * Pre-defined paths
 *
 * @type {Object}
 */
BungieApi.PATHS = {
  GET_GLOBAL_ALERTS: 'platform/GlobalAlerts',
  GET_DESTINY_MANIFEST: '/platform/Destiny/Manifest',
  GET_ACCOUNT_SUMMARY: 'platform/Destiny/:membershipType/Account/:membershipId/Summary',
  GET_ACTIVITY_HISTORY: 'platform/Destiny/Stats/ActivityHistory/:membershipType/:membershipId/:characterId?mode=:mode',
  GET_CHARACTER_INVENTORY: 'platform/Destiny/:membershipType/Account/:membershipId/Character/:characterId/Inventory',
  GET_HISTORICAL_STATS: 'platform/Destiny/Stats/:membershipType/:membershipId/:characterId',
  GET_HISTORICAL_STATS_FOR_ACCOUNT: 'platform/Destiny/Stats/Account/:membershipType/:membershipId',
  GET_POST_GAME_CARNAGE_REPORT: 'platform/Destiny/Stats/PostGameCarnageReport/:activityId/',
  GET_PUBLIC_VENDOR: 'platform/Destiny/Vendors/:vendorId/',
  SEARCH_DESTINY_PLAYER: 'platform/Destiny/SearchDestinyPlayer/:membershipType/:gamertag',
};

/**
 * Known error codes
 *
 * @type {Object}
 */
BungieApi.ERROR_CODES = {
  MAINTENANCE: 5,
  THROTTLE_EXCEED: 51,
  INVALID_ACCOUNT: 1600,
  INVALID_ACCOUNT_2: 1601,
  LEGACY_ACCOUNT: 1670,
  NO_ACTIVITY: 1653,
  NO_VENDOR: 1627
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
  this.apiKey = options.apiKey;
  this.homeUrl = options.homeUrl || BungieApi.HOME_URL;
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
  path = this.parsePath(path, _.clone(params));

  return this.tryRequest(path)
  .catch(function(err) {
    debug(err.message);

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
BungieApi.prototype.tryRequest = function(path) {
  debug('request:', path);

  return request.getAsync({
    url: path,
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
      throw new Error('Invalid status code: ' + response.statusCode);
    }

    var data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      throw new Error('Failed to parse response');
    }

    if (data.ErrorStatus != 'Success') {
      if (BungieApi.NO_DATA_ERRORS.indexOf(data.ErrorCode) >= 0) return null;

      var error = new Error(body);
      error.code = data.ErrorCode;
      throw error;
    }

    return data.Response;
  })
  .catch(function(err) {
    err.message = path + ' failed: ' + err.message;
    throw err;
  });
};

/**
 * @param {String} path
 * @param {Object} params
 * @private
 */
BungieApi.prototype.parsePath = function(path, params) {
  if (!BungieApi.PATHS[path]) return path;

  path = BungieApi.PATHS[path];
  var placeholders = path.match(BungieApi.PARAMS_PATTERN);
  if (placeholders) {
    placeholders.forEach(function(field) {
      field = field.substring(1);
      if (!params[field]) throw new Error('Missing value for :' + field);
      path = path.replace(':' + field, params[field]);
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

  return this.homeUrl + path;
};

/**
 * @return {String}
 * @private
 */
BungieApi.prototype.getApiKey = function() {
  if (!this.apiKey) throw new Error('Bungie API key is not defined');
  return this.apiKey;
};

module.exports = new BungieApi();
module.exports.BungieApi = BungieApi;
module.exports.ERROR = BungieApi.ERROR;
module.exports.ERROR_CODES = BungieApi.ERROR_CODES;
module.exports.ERROR_NAMES = _.invert(BungieApi.ERROR_CODES);