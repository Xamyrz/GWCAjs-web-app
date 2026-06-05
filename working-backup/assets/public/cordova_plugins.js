
  cordova.define('cordova/plugin_list', function(require, exports, module) {
    module.exports = [
      {
          "id": "cordova-plugin-fullscreen.AndroidFullScreen",
          "file": "plugins/cordova-plugin-fullscreen/www/AndroidFullScreen.js",
          "pluginId": "cordova-plugin-fullscreen",
        "clobbers": [
          "AndroidFullScreen"
        ]
        },
      {
          "id": "cordova-plugin-purchase.CdvPurchase",
          "file": "plugins/cordova-plugin-purchase/www/store.js",
          "pluginId": "cordova-plugin-purchase",
        "clobbers": [
          "store",
          "CdvPurchase"
        ]
        },
      {
          "id": "cordova-plugin-chrome-apps-common.events",
          "file": "plugins/cordova-plugin-chrome-apps-common/events.js",
          "pluginId": "cordova-plugin-chrome-apps-common",
        "clobbers": [
          "chrome.Event"
        ]
        },
      {
          "id": "@herdwatch/cordova-plugin-chrome-apps-sockets-tcp.sockets.tcp",
          "file": "plugins/@herdwatch/cordova-plugin-chrome-apps-sockets-tcp/sockets.tcp.js",
          "pluginId": "@herdwatch/cordova-plugin-chrome-apps-sockets-tcp",
        "clobbers": [
          "chrome.sockets.tcp"
        ]
        },
      {
          "id": "cordova-plugin-chrome-apps-common.errors",
          "file": "plugins/cordova-plugin-chrome-apps-common/errors.js",
          "pluginId": "cordova-plugin-chrome-apps-common"
        },
      {
          "id": "cordova-plugin-chrome-apps-common.stubs",
          "file": "plugins/cordova-plugin-chrome-apps-common/stubs.js",
          "pluginId": "cordova-plugin-chrome-apps-common"
        },
      {
          "id": "cordova-plugin-chrome-apps-common.helpers",
          "file": "plugins/cordova-plugin-chrome-apps-common/helpers.js",
          "pluginId": "cordova-plugin-chrome-apps-common"
        }
    ];
    module.exports.metadata =
    // TOP OF METADATA
    {
      "@herdwatch/cordova-plugin-chrome-apps-sockets-tcp": "1.4.0",
      "cordova-plugin-chrome-apps-common": "1.0.7",
      "cordova-plugin-fullscreen": "1.3.0",
      "cordova-plugin-purchase": "13.13.1"
    };
    // BOTTOM OF METADATA
    });
    