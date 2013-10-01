/**
 * name:    OpenFin Desktop JavaScript Adapter
 * version: 1.4.0.0b
 */


var fin = fin || {};

fin.desktop = fin.desktop || {};


(function () {

    console.log("STARTING DESKTOP.JS");

    var mainCallback;
    var isConnected = false;

    fin.desktop.main = function (callback) {
        mainCallback = callback;
        if (isConnected && mainCallback) {
            mainCallback.call(window);
        }
    };

    console.log('Creating WebSocket');

    var socket = new WebSocket('ws://127.0.0.1:' + (fin.desktop._websocket_port ? fin.desktop._websocket_port : '9696'));

    socket.onopen = function () {
        console.log('WebSocket opened in App with auth token');
        var connectedMessage = JSON.stringify({
            action: 'request-authorization',
            payload: {
                type: 'application-token',
                authorizationToken: fin.desktop._application_token
            }
        });

        console.log("Attempting handshake with WebSocket server.");
        socket.send(connectedMessage);
    };

    socket.onmessage = function (event) {

        var message = JSON.parse(event.data);
        var action = message.action;
        var correlationId = message.correlationId;
        var payload = message.payload;

        console.log("message received: action: " + action + " correlationId: " + correlationId);

        if (action == "authorization-response") {
            var success = payload.success;
            var reason = payload.reason;
            if (success) {
                isConnected = true;
                if (mainCallback) mainCallback.call(window);
            } else  {
                console.error("Error connecting to WebSocket server: " + reason);
            }
        } else if (action == "process-message") {
            dispatchMessageToCallbacks(payload.sourceUuid, payload.topic, payload.message);
        } else if (action == "ack") {
            fireMessageCallback(correlationId, payload);
        } else if (action == "ping") {
            respondToPing(payload.pingId);
        } else if (action == "process-system-message") {
            dispatchSystemMessage(message);
        } else if (action == "subscriber-added") {
            dispatchToSubscribeListeners(payload.uuid, payload.topic);
        } else if (action == "subscriber-removed") {
            dispatchToUnsubscribeListeners(payload.uuid, payload.topic);
        } else if (action == "process-notification-event") {
            processNotificationEvent(payload);
        } else if (action == "process-action-from-notification") {
            var handler = window.processActionFromNotification;
            if (typeof handler == "function") handler.call(window, payload);
        } else if (action == "process-action-from-notifications-center") {
            processActionFromNotificationsCenter(payload);
        } else if (action == "process-desktop-event") {
            dispatchDesktopEvent(payload);
        }
    };

    socket.onerror = function () {
        console.error("Error establishing WebSocket connection");
    };

    socket.onclose = function () {
        console.error("WebSocket connection closed");
    };

    var messageId = 0;

    var messageCallbackMap = {};  // correlationId => {successCallback, errorCallback

    function fireMessageCallback(correlationId, response) {


        // Warn of deprecation
        if(response && response.deprecated) {
            var deprecatedInfo = response.deprecated;
            console.warn("Subscribed to " + deprecatedInfo.eventType + ": " + deprecatedInfo.reason);
        }

        if (correlationId != undefined) {

            var msgInfo = messageCallbackMap[correlationId];
            if (msgInfo) {
                if (!response.success) {
                    if (typeof msgInfo.errorCallback == "function") {
                        msgInfo.errorCallback.call(window, response.reason);
                    }

                    console.error("Error performing action: " + msgInfo.action + " : " + response.reason);
                } else if (typeof msgInfo.successCallback == "function") {
                    msgInfo.successCallback.call(window, response.data);
                }
                delete messageCallbackMap[correlationId];
            }
        }
    }

    function sendMessageToDesktop(action, payload, callback, errorCallback) {
        if (isConnected) {
            var messageObject = {
                action: action,
                payload: payload
            };

            if (typeof callback == "function" || typeof errorCallback == "function") {
                messageCallbackMap[messageId] = {};
                var msgCallbackEntry =  messageCallbackMap[messageId];

                if (typeof callback == "function") {
                    msgCallbackEntry['successCallback'] = callback;
                }

                if (typeof errorCallback == "function") {
                    msgCallbackEntry['errorCallback'] = errorCallback;
                }

                messageObject.messageId = messageId;
                messageId++;
            }

            var message = JSON.stringify(messageObject);

            socket.send(message);
        }
    }

    var pingedBefore = false;

    function respondToPing(pingId) {
        if (document.readyState == "interactive" || document.readyState == "complete") {
            console.log("Responding to ping");
            sendMessageToDesktop("pong", {
                correlationId: pingId,
                pingedBefore: pingedBefore
            });
            pingedBefore = true;
        }
    }

    function dispatchSystemMessage(message) {
        if (typeof window.onSystemMessage == "function") {
            window.onSystemMessage(message.payload);
        }
    }


    var desktopEventCallbackMap = {
        window: {

        },
        application: {

        },
        system: {

        }
    };

    function addDesktopEventCallback(subscriptionObject, listener, owner, callback, errorCallback) {
        var map;

        var topic = subscriptionObject.topic;
        var type = getFullEventType(topic, subscriptionObject.type);

        var uuid, name;
        var callbacks;

        switch (topic) {
            case "window":
                uuid = subscriptionObject.uuid;
                name = subscriptionObject.name;
                desktopEventCallbackMap[topic][type] = desktopEventCallbackMap[topic][type] || {};
                map = desktopEventCallbackMap[topic][type];
                map[uuid] = map[uuid] || {};
                map = map[uuid];
                map[name] = map[name] || [];
                callbacks = map[name];

                break;
            case "application":
                uuid = subscriptionObject.uuid;
                desktopEventCallbackMap[topic][type] = desktopEventCallbackMap[topic][type] || {};
                map = desktopEventCallbackMap[topic][type];
                map[uuid] = map[uuid] || [];
                callbacks = map[uuid];

                break;
            case "system":
                desktopEventCallbackMap[topic][type] = desktopEventCallbackMap[topic][type] || [];
                callbacks = desktopEventCallbackMap[topic][type];
                break;

        }

        if(callbacks) {
            if (callbacks.length == 0) {
                sendMessageToDesktop("subscribe-to-desktop-event", subscriptionObject, callback, errorCallback);
            }

            listener._owner = owner;
            callbacks.push(listener);
        } else {
            console.error("Could not subscribe to unknown event \'" + type + "\'.");
        }

    }


    function removeDesktopEventCallback(subscriptionObject, listener, callback, errorCallback) {
        var map = desktopEventCallbackMap;

        var topic = subscriptionObject.topic;
        var type = getFullEventType(topic, subscriptionObject.type);

        var uuid, name;
        var callbacks;

        switch (topic) {
            case "window":
                uuid = subscriptionObject.uuid;
                name = subscriptionObject.name;

                if (map[topic][type] && map[topic][type][uuid] && map[topic][type][uuid][name])
                    callbacks = map[topic][type][uuid][name];

                break;
            case "application":
                uuid = subscriptionObject.uuid;

                if (map[topic][type] && map[topic][type][uuid])
                    callbacks = map[topic][type][uuid];

                break;
            case "system":
                if (map[topic][type])
                    callbacks = map[topic][type];
                break;
        }

        if (callbacks) {
            var index = callbacks.indexOf(listener);
            if (index != -1) {
                callbacks.splice(index, 1);
                if (callbacks.length == 0) {
                    sendMessageToDesktop("unsubscribe-to-desktop-event", subscriptionObject, callback, errorCallback);
                }
            }
        }
    }

    function dispatchDesktopEvent(subscriptionObject) {

        var map = desktopEventCallbackMap;

        var topic = subscriptionObject.topic;
        var type = getFullEventType(topic, subscriptionObject.type);

        var uuid, name;
        var callbacks;

        switch (topic) {
            case "window":
                uuid = subscriptionObject.uuid;
                name = subscriptionObject.name;

                if (map[topic][type] && map[topic][type][uuid] && map[topic][type][uuid][name])
                    callbacks = map[topic][type][uuid][name];

                break;
            case "application":
                uuid = subscriptionObject.uuid;

                if (map[topic][type] && map[topic][type][uuid])
                    callbacks = map[topic][type][uuid];

                break;
            case "system":
                if (map[topic][type])
                    callbacks = map[topic][type];
                break;
        }

        var eventObject = subscriptionObject;
        if (callbacks) {
            callbacks.forEach(function (callback) {
                callback.call(callback._owner, eventObject);
            });
        }
    }

    function getFullEventType(category, type) {
        var fullType;
        switch (category) {
            case "system":
                fullType = type;
                break;
            case "window":
                fullType = (type.indexOf("window-") == -1) ? ("window-" + type) : type;
                break;
            case "application":
                fullType = (type.indexOf("application-") == -1) ? ("application-" + type) : type;
                break;
        }
        return fullType;
    }

    var interAppBusCallbackMap = {};

    function dispatchMessageToCallbacks(senderUuid, topic, message) {
        console.log("Dispatching message to callbacks from " + senderUuid + " on " + topic);

        /**
         * Dispatch the message to callback by application and then topic.
         */

        var appMap;

        if ("*" in interAppBusCallbackMap) {
            appMap = interAppBusCallbackMap["*"];
            var topicMap = appMap[topic];
            if (topicMap) {
                //var msgObj = JSON.parse(message);
                topicMap.forEach(function (cb) {
                    cb.call(window, message, senderUuid);
                });
            }
        }

        appMap = interAppBusCallbackMap[senderUuid];

        if (appMap) {
            topicMap = appMap[topic];
            if (topicMap) {
                //var msgObj = JSON.parse(message);
                topicMap.forEach(function (cb) {
                    cb.call(window, message, senderUuid);
                });
            }
        }
    }

    fin.desktop.System = {
        getDeviceId: function (callback, errorCallback) {
            sendMessageToDesktop('get-device-id', {}, callback, errorCallback);
        },
        getVersion: function (callback, errorCallback) {
            sendMessageToDesktop('get-version', {}, callback, errorCallback);
        },
        getCommandLineArguments: function (callback, errorCallback) {
            sendMessageToDesktop('get-command-line-arguments', {}, callback, errorCallback);
        },
        getProcessList: function (callback, errorCallback) {
            sendMessageToDesktop('process-snapshot', {}, callback, errorCallback);
        },
        getLog: function (logName, callback, errorCallback) {
            sendMessageToDesktop('view-log', {
                name: logName
            }, callback, errorCallback);
        },
        getLogList: function (callback, errorCallback) {
            if (callback) {
                sendMessageToDesktop('list-logs', {}, function (logArray) {
                    logArray.forEach(function (log) {
                        var dateString = log.date;
                        log.date = new Date(dateString);
                    });

                    callback.call(window, logArray);
                }, errorCallback);
            } else {
                sendMessageToDesktop('list-logs', {}, callback, errorCallback);
            }
        },
        log: function (level, message, callback) {
            sendMessageToDesktop('write-to-log', {
                level: level,
                message: message
            }, callback);

            if (level == "info") {
                console.log(message);
            } else if (level == "warning") {
                console.warn(message);
            } else if (level == "error") {
                console.error(message);
            }
        },
        getProxySettings: function (callback, errorCallback) {
            sendMessageToDesktop('get-proxy-settings', {}, callback, errorCallback);
        },
        updateProxySettings: function (type, proxyAddress, proxyPort, callback, errorCallback) {
            sendMessageToDesktop('update-proxy', {
                type: type,
                proxyAddress: proxyAddress,
                proxyPort: proxyPort
            }, callback, errorCallback);
        },
        clearCache: function (options, callback, errorCallback) {
            sendMessageToDesktop('clear-cache', {
                cache: options.cache,
                cookies: options.cookies,
	            localStorage: options.localStorage,
		        appcache: options.appcache,
                userData: options.userData
            }, callback, errorCallback);
        },
        deleteCacheOnRestart: function (callback, errorCallback) {
            sendMessageToDesktop('delete-cache-request', {}, callback, errorCallback);
        },
        installStartIcon: function (options, callback, errorCallback) {
            sendMessageToDesktop('install-start-icon', {
				enabledIcon: options.enabledIcon,
				disabledIcon: options.disabledIcon,
                hoverIcon: options.hoverIcon
			}, callback, errorCallback);
        },
        removeStartIcon: function (callback, errorCallback) {
            sendMessageToDesktop('remove-start-icon', {}, callback, errorCallback);
        },
        showStartWindow: function (callback, errorCallback) {
            sendMessageToDesktop('show-start-window', {}, callback, errorCallback);
        },
        hideStartWindow: function (callback, errorCallback) {
            sendMessageToDesktop('hide-start-window', {}, callback, errorCallback);
        },
        getMonitorInfo: function (callback, errorCallback) {
            sendMessageToDesktop('get-monitor-info', {}, callback, errorCallback);
        },
        getAllWindows: function (callback, errorCallback) {
            sendMessageToDesktop('get-all-windows', {}, callback, errorCallback);
        },
        getMousePosition: function (callback, errorCallback) {
            sendMessageToDesktop('get-mouse-position', {}, callback, errorCallback);
        },
        showDeveloperTools: function (applicationUuid, windowName, callback, errorCallback) {
            sendMessageToDesktop('show-developer-tools', {
                uuid: applicationUuid,
                name: windowName
            }, callback, errorCallback);
        },
        exit: function (callback) {
            sendMessageToDesktop('exit-desktop', {}, callback);
        },
        openUrlWithBrowser: function (url, callback, errorCallback) {
            sendMessageToDesktop('open-url-with-browser', {
                url: url
            }, callback, errorCallback);
        },
        addEventListener: function (type, listener, callback, errorCallback) {
            addDesktopEventCallback({
                topic: "system",
                type: type
            }, listener, this, callback, errorCallback);
        },
        removeEventListener: function (type, listener, callback, errorCallback) {
            removeDesktopEventCallback({
                topic: "system",
                type: type
            }, listener, callback, errorCallback);
        }
    };

    fin.desktop.Application = function (options, callback, errorCallback) {
        var opt = deepObjCopy(options);

        this.name = opt.name;
        this.uuid = opt.uuid;
        this.mainWindowOptions = opt.mainWindowOptions;

        if (typeof this.mainWindowOptions == "object") {
            this.mainWindowOptions.defaultHeight = Math.floor(this.mainWindowOptions.defaultHeight);
            this.mainWindowOptions.defaultWidth = Math.floor(this.mainWindowOptions.defaultWidth);
            this.mainWindowOptions.defaultTop = Math.floor(this.mainWindowOptions.defaultTop);
            this.mainWindowOptions.defaultLeft = Math.floor(this.mainWindowOptions.defaultLeft);
        }

        if (!opt._noregister) {
            sendMessageToDesktop('create-application', opt, callback, errorCallback);
        }

        this.window = new fin.desktop.Window({
            _noregister: true,
            _nocontentwindow: true,
            uuid: this.uuid,
            name: this.uuid
        });
    };

    fin.desktop.Application.wrap = function (uuid) {
        return new fin.desktop.Application({
            uuid: uuid,
            _noregister: true
        });
    };

    fin.desktop.Application.getCurrentApplication = function () {
        console.warn("Function is deprecated");
        if (!this._instance) {
            this._instance = fin.desktop.Application.wrap(fin.desktop._app_uuid);
        }
        return this._instance;
    };

    fin.desktop.Application.getCurrent = function () {
        if (!this._instance) {
            this._instance = fin.desktop.Application.wrap(fin.desktop._app_uuid);
        }
        return this._instance;
    };

    fin.desktop.Application.prototype = {
        run: function (callback, errorCallback) {
            sendMessageToDesktop('run-application', {
                uuid: this.uuid
            }, callback, errorCallback);
        },
        restart: function (callback, errorCallback) {
            sendMessageToDesktop('restart-application', {
                uuid: this.uuid
            }, callback, errorCallback);
        },
        close: function (callback, errorCallback) {
            sendMessageToDesktop('close-application', {
                uuid: this.uuid
            }, callback, errorCallback);
        },
        terminate: function (callback, errorCallback) {
            sendMessageToDesktop('terminate-application', {
                uuid: this.uuid
            }, callback, errorCallback);
        },
        wait: function (callback, errorCallback) {
            sendMessageToDesktop('wait-for-hung-application', {
                uuid: this.uuid
            }, callback, errorCallback);
        },
        remove: function (callback, errorCallback) {
            sendMessageToDesktop('remove-application', {
                uuid: this.uuid
            }, callback, errorCallback);
        },
        pingChildWindow: function (name, callback, errorCallback) {
            sendMessageToDesktop("ping-child-window", {
                uuid: this.uuid,
                name: name
            }, callback, errorCallback);
        },
        getWindow: function () {
            return this.window;
        },
        addEventListener: function (type, listener, callback, errorCallback) {
            addDesktopEventCallback({
                topic: "application",
                type: type,
                uuid: this.uuid
            }, listener, this, callback, errorCallback);
        },
        removeEventListener: function (type, listener, callback, errorCallback) {
            removeDesktopEventCallback({
                topic: "application",
                type: type,
                uuid: this.uuid
            }, listener, callback, errorCallback);
        }
    };

    var windowList = {};

    fin.desktop.Window = function (options, callback, errorCallback) {
        var opt = deepObjCopy(options);


        opt.defaultHeight = Math.floor(opt.defaultHeight);
        opt.defaultWidth = Math.floor(opt.defaultWidth);
        opt.defaultTop = Math.floor((typeof opt.defaultTop == 'number'? opt.defaultTop : 100 ));
        opt.defaultLeft = Math.floor((typeof opt.defaultLeft == 'number'? opt.defaultLeft : 100 ));

        this.connected = opt.connected;
        this.name = opt.name;
        this.app_uuid = opt.uuid;


        if (!opt._noregister) {

            var me = this;

            opt.uuid = fin.desktop._app_uuid;
            this.app_uuid = opt.uuid;
            var url = opt.url;

            sendMessageToDesktop('register-child-window-settings', opt, function (evt) {
                me.contentWindow = window.open(url, me.name);
                windowList[me.name] = me.contentWindow;

                if (callback) callback.call(me);
            }, errorCallback);

        } else {
            if (!opt._nocontentwindow) this.contentWindow = window;
            if (this.name == window.name) {
                this.contentWindow = window;
            } else {
                this.contentWindow = windowList[this.name];
            }
            if (callback) callback.call(me);
        }
    };

    fin.desktop.Window.getCurrentWindow = function() {
        console.warn("Function is deprecated");
        if (!this._instance) {
            this._instance = fin.desktop.Window.wrap(fin.desktop._app_uuid, window.name);
        }
        return this._instance;
    };

    fin.desktop.Window.getCurrent = function() {
        if (!this._instance) {
            this._instance = fin.desktop.Window.wrap(fin.desktop._app_uuid, window.name);
        }
        return this._instance;
    };

    fin.desktop.Window.wrap = function (appUuid, windowName) {
        return new fin.desktop.Window({
            uuid: appUuid,
            name: windowName,
            _noregister: true
        });
    };

    fin.desktop.Window.prototype = {
        show: function (callback, errorCallback) {
            sendMessageToDesktop('show-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        showAt: function (left, top, toggle, callback, errorCallback) {
            sendMessageToDesktop('show-at-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left),
				toggle: toggle
            }, callback, errorCallback);
        },
        hide: function (callback, errorCallback) {
            sendMessageToDesktop('hide-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        close: function(callback, errorCallback) {
            sendMessageToDesktop('close-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        minimize: function (callback, errorCallback) {
            sendMessageToDesktop('minimize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        maximize: function (callback, errorCallback) {
            sendMessageToDesktop('maximize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        restore: function (callback, errorCallback) {
            sendMessageToDesktop('restore-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        focus: function (callback, errorCallback) {
            sendMessageToDesktop('focus-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        blur: function (callback, errorCallback) {
            sendMessageToDesktop('blur-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        getState: function (callback, errorCallback) {
            sendMessageToDesktop('get-window-state', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        getBounds: function (callback, errorCallback) {
            sendMessageToDesktop('get-window-bounds', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        moveTo: function (left, top, callback, errorCallback) {
            sendMessageToDesktop('move-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left)
            }, callback, errorCallback);
        },
        moveBy: function (deltaLeft, deltaTop, callback, errorCallback) {
            sendMessageToDesktop('move-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaTop: Math.floor(deltaTop),
                deltaLeft: Math.floor(deltaLeft)
            }, callback, errorCallback);
        },
        resizeTo: function (width, height, anchor, callback, errorCallback) {
            sendMessageToDesktop('resize-window', {
                uuid: this.app_uuid,
                name: this.name,
                width: Math.floor(width),
                height: Math.floor(height),
                anchor: anchor
            }, callback, errorCallback);
        },
        resizeBy: function (deltaWidth, deltaHeight, anchor, callback, errorCallback) {
            sendMessageToDesktop('resize-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaWidth: Math.floor(deltaWidth),
                deltaHeight: Math.floor(deltaHeight),
                anchor: anchor
            }, callback, errorCallback);
        },
        isShowing: function (callback, errorCallback) {
            sendMessageToDesktop('is-window-showing', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        bringToFront: function (callback, errorCallback) {
            sendMessageToDesktop('bring-window-to-front', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        updateOptions: function (options, callback, errorCallback) {
            sendMessageToDesktop('update-window-options', {
                uuid: this.app_uuid,
                name: this.name,
                options: options
            }, callback, errorCallback);
        },
        animate: function (transitions, options, callback, errorCallback) {
            sendMessageToDesktop('animate-window', {
                uuid: this.app_uuid,
                name: this.name,
                transitions: transitions,
                options: options
            }, callback, errorCallback);
        },
        getNativeWindow: function () {
            return this.contentWindow;
        },
        joinGroup: function (target, callback, errorCallback) {
            sendMessageToDesktop('join-window-group', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: target.name
            }, callback, errorCallback);
        },
        mergeGroups: function (target, callback, errorCallback) {
            sendMessageToDesktop('merge-window-groups', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: target.name
            }, callback, errorCallback);
        },
        leaveGroup: function (callback, errorCallback) {
            sendMessageToDesktop('leave-window-group', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        redirect: function (url) {
            if (this.contentWindow != undefined) {
                if (this.contentWindow != window)
                    this.contentWindow = window.open(url, this.name);
                else
                    window.location.href = url;
            } else {
                throw new Error("Cannot redirect url of application");
            }
        },
        addEventListener: function (type, listener, callback, errorCallback) {
            addDesktopEventCallback({
                topic: "window",
                type: type,
                name: this.name,
                uuid: this.app_uuid
            }, listener, this, callback, errorCallback);
        },
        removeEventListener: function (type, listener, callback, errorCallback) {
            removeDesktopEventCallback({
                topic: "window",
                type: type,
                name: this.name,
                uuid: this.app_uuid
            }, listener, callback, errorCallback);
        }
    };


    fin.desktop.Gadget = function (options, callback, errorCallback) {
        var opt = deepObjCopy(options);
        opt.frame = false;
        opt.draggable = true;
        opt.resizable = false;
        opt.alwaysOnBottom = true;

        fin.desktop.Window.call(this, opt, callback, errorCallback);
    };

    fin.desktop.Gadget.prototype = {
        show: function (callback, errorCallback) {
            sendMessageToDesktop('show-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        showAt: function (left, top, toggle, callback, errorCallback) {
            sendMessageToDesktop('show-at-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left),
				toggle: toggle
            }, callback, errorCallback);
        },
        hide: function (callback, errorCallback) {
            sendMessageToDesktop('hide-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        close: function(callback, errorCallback) {
            sendMessageToDesktop('close-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        minimize: function (callback, errorCallback) {
            sendMessageToDesktop('minimize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        maximize: function (callback, errorCallback) {
            sendMessageToDesktop('maximize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        restore: function (callback, errorCallback) {
            sendMessageToDesktop('restore-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        focus: function (callback, errorCallback) {
            sendMessageToDesktop('focus-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        blur: function (callback, errorCallback) {
            sendMessageToDesktop('blur-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        isShowing: function (callback, errorCallback) {
            sendMessageToDesktop('is-window-showing', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        getState: function (callback, errorCallback) {
            sendMessageToDesktop('get-window-state', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        getBounds: function (callback, errorCallback) {
            sendMessageToDesktop('get-window-bounds', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        moveTo: function (left, top, callback, errorCallback) {
            sendMessageToDesktop('move-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left)
            }, callback, errorCallback);
        },
        moveBy: function (deltaLeft, deltaTop, callback, errorCallback) {
            sendMessageToDesktop('move-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaTop: Math.floor(deltaTop),
                deltaLeft: Math.floor(deltaLeft)
            }, callback, errorCallback);
        },
        resizeTo: function (width, height, anchor, callback, errorCallback) {
            sendMessageToDesktop('resize-window', {
                uuid: this.app_uuid,
                name: this.name,
                width: Math.floor(width),
                height: Math.floor(height),
                anchor: anchor
            }, callback, errorCallback);
        },
        resizeBy: function (deltaWidth, deltaHeight, anchor, callback, errorCallback) {
            sendMessageToDesktop('resize-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaWidth: Math.floor(deltaWidth),
                deltaHeight: Math.floor(deltaHeight),
                anchor: anchor
            }, callback, errorCallback);
        },
        bringToFront: function (callback, errorCallback) {
            sendMessageToDesktop('bring-window-to-front', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        getNativeWindow: function () {
            return this.contentWindow;
        },
        joinGroup: function (wnd, callback, errorCallback) {
            sendMessageToDesktop('join-window-group', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: wnd.name,
                groupingWindowUuid: wnd.uuid
            }, callback, errorCallback);
        },
        mergeGroups: function (wnd, callback) {
            sendMessageToDesktop('merge-window-groups', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: wnd.name,
                groupingWindowUuid: wnd.uuid
            }, callback);
        },
        leaveGroup: function (callback, errorCallback) {
            sendMessageToDesktop('leave-window-group', {
                uuid: this.app_uuid,
                name: this.name
            }, callback, errorCallback);
        },
        redirect: function (url) {
            if (this.contentWindow != undefined) {
                if (this.contentWindow != window)
                    this.contentWindow = window.open(url, this.name);
                else
                    window.location.href = url;
            } else {
                throw new Error("Cannot redirect url of application");
            }
        },
        addEventListener: function (type, listener, callback, errorCallback) {
            addDesktopEventCallback({
                topic: "window",
                type: type,
                name: this.name,
                uuid: this.app_uuid
            }, listener, this, callback, errorCallback);
        },
        removeEventListener: function (type, listener, callback, errorCallback) {
            removeDesktopEventCallback({
                topic: "window",
                type: type,
                name: this.name,
                uuid: this.app_uuid
            }, listener, callback, errorCallback);
        }
    };

    (function () {

        var pageX, pageY;

        window.addEventListener('mousemove', function (event) {
            pageX = event.pageX;
            pageY = event.pageY;
        }, true);

        window.addEventListener('click', function (event) {
            pageX = event.pageX;
            pageY = event.pageY;
        }, true);


        fin.desktop.Flyout = function (options, callback, errorCallback) {

            var opt = deepObjCopy(options);
            opt.frame = false;
            opt.resizable = false;

            opt.defaultHeight = opt.defaultHeight || 100;
            opt.defaultWidth = opt.defaultWidth || 100;


            var me = this;

            fin.desktop.Window.call(this, opt, function () {
                me.contentWindow.addEventListener('click', function () {
                    me.hide();
                }, false);
                me.contentWindow.addEventListener('blur', function () {
                    me.hide();
                }, false);
                if (callback) callback.call(me);
            }, errorCallback);

            window.addEventListener('click', function () {
                me.hide();
            })
        };

        fin.desktop.Flyout.prototype = {
            show: function (callback, errorCallback) {
                sendMessageToDesktop('show-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            showAt: function (left, top, toggle, callback, errorCallback) {
                sendMessageToDesktop('show-at-window', {
                    uuid: this.app_uuid,
                    name: this.name,
                    top: Math.floor(top),
                    left: Math.floor(left),
                    toggle: toggle
                }, callback, errorCallback);
            },
            hide: function (callback, errorCallback) {
                sendMessageToDesktop('hide-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            close: function (callback, errorCallback) {
                sendMessageToDesktop('close-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            minimize: function (callback, errorCallback) {
                sendMessageToDesktop('minimize-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            maximize: function (callback, errorCallback) {
                sendMessageToDesktop('maximize-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            restore: function (callback, errorCallback) {
                sendMessageToDesktop('restore-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            focus: function (callback, errorCallback) {
                sendMessageToDesktop('focus-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            blur: function (callback, errorCallback) {
                sendMessageToDesktop('blur-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            isShowing: function (callback, errorCallback) {
                sendMessageToDesktop('is-window-showing', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            getState: function (callback, errorCallback) {
                sendMessageToDesktop('get-window-state', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            getBounds: function (callback, errorCallback) {
                sendMessageToDesktop('get-window-bounds', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            moveTo: function (left, top, callback, errorCallback) {
                sendMessageToDesktop('move-window', {
                    uuid: this.app_uuid,
                    name: this.name,
                    top: Math.floor(top),
                    left: Math.floor(left)
                }, callback, errorCallback);
            },
            moveBy: function (deltaLeft, deltaTop, callback, errorCallback) {
                sendMessageToDesktop('move-window-by', {
                    uuid: this.app_uuid,
                    name: this.name,
                    deltaTop: Math.floor(deltaTop),
                    deltaLeft: Math.floor(deltaLeft)
                }, callback, errorCallback);
            },
            resizeTo: function (width, height, anchor, callback, errorCallback) {
                sendMessageToDesktop('resize-window', {
                    uuid: this.app_uuid,
                    name: this.name,
                    width: Math.floor(width),
                    height: Math.floor(height),
                    anchor: anchor
                }, callback, errorCallback);
            },
            resizeBy: function (deltaWidth, deltaHeight, anchor, callback, errorCallback) {
                sendMessageToDesktop('resize-window-by', {
                    uuid: this.app_uuid,
                    name: this.name,
                    deltaWidth: Math.floor(deltaWidth),
                    deltaHeight: Math.floor(deltaHeight),
                    anchor: anchor
                }, callback, errorCallback);
            },
            bringToFront: function (callback, errorCallback) {
                sendMessageToDesktop('bring-window-to-front', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback, errorCallback);
            },
            getNativeWindow: function () {
                return this.contentWindow;
            },
            redirect: function (url) {
                if (this.contentWindow != undefined) {
                    if (this.contentWindow != window)
                        this.contentWindow = window.open(url, this.name);
                    else
                        window.location.href = url;
                } else {
                    throw new Error("Cannot redirect url of application");
                }
            },
            addEventListener: function (type, listener, callback, errorCallback) {
                addDesktopEventCallback({
                    topic: "window",
                    type: type,
                    name: this.name,
                    uuid: this.app_uuid
                }, listener, this, callback, errorCallback);
            },
            removeEventListener: function (type, listener, callback, errorCallback) {
                removeDesktopEventCallback({
                    topic: "window",
                    type: type,
                    name: this.name,
                    uuid: this.app_uuid
                }, listener, callback, errorCallback);
            }
        };

        fin.desktop.Flyout.prototype.show = function (callback) {

            var outerWidth, outerHeight;

            try {
                outerWidth = this.contentWindow.outerWidth;
                outerHeight = this.contentWindow.outerHeight;
            } catch (e) {
                console.warn("Flyout may not work properly when run locally (file:///) or when instantiated from a parent window with a different origin.");
            }

            var first_x = window.screenX + (window.outerWidth - window.innerWidth)/2 + pageX;
            var second_x = first_x - outerWidth;

            var first_y = window.screenY + (window.outerHeight - window.innerHeight)/2 + pageY + 10;
            var second_y = first_y - outerHeight + 10;

            var max_x = window.screenX + (window.outerWidth - window.innerWidth)/2 + pageX + outerWidth;
            var max_y = window.screenY + (window.outerHeight - window.innerHeight)/2 + pageY + outerHeight;

            var final_x, final_y;

            if (max_x < screen.width) {
                final_x = first_x;
            } else {
                final_x = second_x;
            }

            if (max_y < screen.height) {
                final_y = first_y;
            } else {
                final_y = second_y;
            }
            var me = this;

            this.moveTo(final_x, final_y, function () {
                console.error('Flyout::sending show message');
                fin.desktop.Window.prototype.show.call(me, callback);
            });

        };

    })();

    var notificationEventCallbackMap = {};

    function processNotificationEvent(message) {

        var type = message.type;
        var callback;

        var notificationId = message.payload.notificationId;

        if (typeof notificationId != "undefined") {
            var events = notificationEventCallbackMap[notificationId];

            if (events) {
                if (type == "message") {
                    callback = events.onMessage;
                    if (typeof callback == "function") {
                        callback.call(window, message.payload.message);
                    }
                    return;
                } else if (type == "show") {
                    callback = events.onShow;
                } else if (type == "close") {
                    callback = events.onClose;
                    delete notificationEventCallbackMap[notificationId];
                } else if (type == "error") {
                    callback = events.onError;

                    if (typeof callback == "function") {
                        callback.call(window, message.payload.reason);
                    }
                    return;
                } else if (type == "click") {
                    callback = events.onClick;
                } else if (type == "dismiss") {
                    callback = events.onDismiss;
                }

                if (typeof callback == "function") {
                    callback.call(window);
                }

            }
        }

    }


    var currentNotification;
    var notificationToken;



    function processActionFromNotificationsCenter(payload) {
        console.log('message received from openfin');

        var type = payload.type;
        var callback;

        if (type == "message") {
            callback = window.onNotificationMessage;
            if (typeof callback == "function") {
                callback.call(window, payload.payload.message);
            }
        } else if (type == "initialize-notification") {
            notificationToken = payload.payload.token;
            callback = window.onNotificationMessage;

            if (typeof callback == "function") {
                callback.call(window, payload.payload.message);
            }

            window.addEventListener('click', function () {
                if (currentNotification) {
                    sendActionToNotificationsCenter("click-notification", {
                        token: notificationToken
                    });
                }
            });


            window.addEventListener('mouseover', function (evt) {
                if (evt.fromElement == null) {
                    sendActionToNotificationsCenter("update-mouse-position", {
                        token: notificationToken,
                        isMouseOver: true
                    });
                }
            });

            window.addEventListener('mouseout', function (evt) {
                if (evt.toElement == null) {
                    sendActionToNotificationsCenter("update-mouse-position", {
                        token: notificationToken,
                        isMouseOver: false
                    });
                }
            });

        } else if (type == "register-drag-handler") {
            registerDragHandler(window, {
                onDragStart: function (x, y) {
                    sendDragEvent("dragstart", x, y, window.screenX, window.screenY);
                },
                onDrag: function (x, y) {
                    sendDragEvent("drag", x, y, window.screenX, window.screenY);
                },
                onDragEnd: function (x, y) {
                    sendDragEvent("dragend", x, y, window.screenX, window.screenY);
                },
                onClick: function(x, y) {
                    sendDragEvent("clicked", x, y, window.screenX, window.screenY);
                }
            }, payload.payload.options);

            function sendDragEvent(type, x, y, screenX, screenY) {
                sendActionToNotificationsCenter("fire-drag-event", {
                    action: type,
                    token: notificationToken,
                    payload: {
                        x: x,
                        y: y,
                        screenX: screenX,
                        screenY: screenY
                    }
                });
            }
        }
    }

    function sendActionToNotificationsCenter(action, payload, callback) {
        sendMessageToDesktop("send-action-to-notifications-center", {
            action: action,
            payload: payload
        }, callback);
    }


    (function () {

        var notificationId = 0;

        fin.desktop.Notification = function (options, callback, errorCallback) {

            var me = this;
            if (!options._noregister) {

                sendActionToNotificationsCenter("create-notification", {
                    url: qualifyURL(options.url),
                    notificationId: notificationId,
                    message: options.message,
                    timeout: options.timeout
                }, callback, errorCallback);


                notificationEventCallbackMap[notificationId] = {
                    onClose: options.onClose,
                    onClick: options.onClick,
                    onError: options.onError,
                    onShow: options.onShow,
                    onMessage: options.onMessage,
                    onDismiss: options.onDismiss
                };

                me.notificationId = notificationId;
                notificationId++;

            } else {
                // return a blank object
            }

            function qualifyURL(url) {
                var a = document.createElement('a');
                a.href = url;
                return a.href;
            }

        };

        fin.desktop.Notification.prototype = {
            close: function (callback) {
                sendActionToNotificationsCenter("close-notification", {
                    notificationId: this.notificationId,
                    token: notificationToken
                }, callback);
            },
            sendMessage: function (message, callback) {
                sendActionToNotificationsCenter("send-notification-message", {
                    notificationId: this.notificationId,
                    message: message,
                    token: notificationToken
                }, callback);
            },
            sendMessageToApplication: function (message, callback) {
                sendActionToNotificationsCenter("send-application-message", {
                    notificationId: this.notificationId,
                    message: message,
                    token: notificationToken
                }, callback);
            }
        };

        fin.desktop.Notification.getCurrentNotification = function () {
            console.warn("Function is deprecated");
            return currentNotification;
        };

        fin.desktop.Notification.getCurrent = function () {
            return currentNotification;
        };

        currentNotification = new fin.desktop.Notification({
            _noregister: true
        });


    })();


    (function () {

        fin.desktop.OldNotification = function(url) {
            var path = (function() {
                var loc = window.location.href;
                var pathName = loc.substring(0, loc.lastIndexOf('/') + 1);
                return pathName;
            })();
            this.url = path + url;
        };

        /**
         * Notification prototype methods
         */
        fin.desktop.OldNotification.prototype = {
            show: function(message, callback) {
                sendMessageToDesktop("create-notification", {
                    uuid: fin.desktop._app_uuid,
                    message: message,
                    url: this.url
                }, callback);
            }
        };
    })();


    /**
     * @class InterApplicationBus A messaging bus that allows for pub / sub messaging between different applications.
     *
     * @constructor
     */

    fin.desktop.InterApplicationBus = function () {

    };

    fin.desktop.InterApplicationBus.prototype.constructor = fin.desktop.InterApplicationBus;

    fin.desktop.InterApplicationBus.publish = function (topic, message) {
        sendMessageToDesktop('publish-message', {
            topic: topic,
            message: message
        });
    };

    fin.desktop.InterApplicationBus.send = function (destinationUuid, topic, message) {
        sendMessageToDesktop('send-message', {
            destinationUuid: destinationUuid,
            topic: topic,
            message: message
        });
    };

    fin.desktop.InterApplicationBus.subscribe = function (senderUuid, topic, callback) {
        var cbm = interAppBusCallbackMap;
        cbm[senderUuid] = cbm[senderUuid] || {};
        cbm[senderUuid][topic] = cbm[senderUuid][topic] || [];
        cbm[senderUuid][topic].push(callback);

        sendMessageToDesktop('subscribe', {
            sourceUuid: senderUuid,
            topic: topic
        });

    };

    fin.desktop.InterApplicationBus.unsubscribe = function (senderUuid, topic, callback) {
        var cbs = interAppBusCallbackMap[senderUuid][topic];
        if (cbs !== undefined) {
            cbs.splice(cbs.lastIndexOf(callback),1);
            sendMessageToDesktop('unsubscribe', {
                sourceUuid: senderUuid,
                topic: topic
            });
        }
    };

    var subscribeCallbacks = [];

    fin.desktop.InterApplicationBus.addSubscribeListener = function (listener) {
        subscribeCallbacks.push(listener);
    };

    fin.desktop.InterApplicationBus.removeSubscribeListener = function (listener) {
        var index = subscribeCallbacks.indexOf(listener);
        subscribeCallbacks.splice(index,1);
    };

    var unsubscribeCallbacks = [];

    fin.desktop.InterApplicationBus.addUnsubscribeListener = function (listener) {
        unsubscribeCallbacks.push(listener);
    };

    fin.desktop.InterApplicationBus.removeUnsubscribeListener = function (listener) {
        var index = unsubscribeCallbacks.indexOf(listener);
        unsubscribeCallbacks.splice(index,1);
    };

    function dispatchToSubscribeListeners(uuid, topic) {
        unsubscribeCallbacks.forEach(function (callback) {
            callback(uuid, topic);
        });
    }

    function dispatchToUnsubscribeListeners(uuid, topic) {
        unsubscribeCallbacks.forEach(function (callback) {
            callback(uuid, topic);
        });
    }

    fin.desktop.InterApplicationBus.prototype = {
        /**
         * Publishes a message on the specified topic.
         * @param {string} topic - Required The topic on which the message is published.
         * @param {object} message - Required A JSON object message to be published.
         */
        publish: fin.desktop.InterApplicationBus.publish,
        /**
         * Sends a message to a specific application on a specific topic.
         * @param {string} applicationId - Required The id of an application to which the message is sent.
         * @param {string} topic - Required The topic on which the message is published.
         * @param {object} message - Required A JSON object message to be published.
         */
        send: fin.desktop.InterApplicationBus.send,
        /**
         * Subscribes a callback to messages originating from a specific application and topic.
         * @param {string} applicationId - Required The id of an application to which the client subscribes.
         * @param {string} topic - Required The topic to which the client subscribes.
         * @param {function} callback - Required A callback which is called whenever a message is generated
         *                              from the application on the specified topic. Receives the applicationId,
         *                              topic and message.
         */
        subscribe: fin.desktop.InterApplicationBus.subscribe,
        /**
         * Unsubscribes a callback to messages originating from a specific application and topic.
         * @param {string} applicationId - Required The id of an application from which the client unsubscribes.
         * @param {string} topic - Required The topic from which the client unsubscribes.
         * @param {function} callback - Required The subscribed callback.
         */
        unsubscribe: fin.desktop.InterApplicationBus.unsubscribe
    };

    function deepObjCopy (dupeObj) {
        var retObj;
        if (typeof(dupeObj) == 'object') {
            if (Array.isArray(dupeObj))
                retObj = [];
            else
                retObj = {};
            for (var objInd in dupeObj) {
                if (typeof(dupeObj[objInd]) == 'object') {
                    retObj[objInd] = deepObjCopy(dupeObj[objInd]);
                } else if (typeof(dupeObj[objInd]) == 'string') {
                    retObj[objInd] = dupeObj[objInd];
                } else if (typeof(dupeObj[objInd]) == 'number') {
                    retObj[objInd] = dupeObj[objInd];
                } else if (typeof(dupeObj[objInd]) == 'boolean') {
                    ((dupeObj[objInd]) ? retObj[objInd] = true : retObj[objInd] = false);
                } else if (typeof (dupeObj[objInd]) == 'function') {
                    retObj[objInd] = dupeObj[objInd];
                }
            }
        } else {
            retObj = dupeObj;
        }
        return retObj;
    }


    function registerDragHandler(wnd, handlers, options) {
        var mouseDown = false;
        var mouseMoved = false;

        var onDrag = handlers.onDrag,
            onDragEnd = handlers.onDragEnd,
            onDragStart = handlers.onDragStart,
            onClick = handlers.onClick;

        var x_offset, y_offset;
        var OPTIONS = options || {};
        var THRESH = OPTIONS.thresh || 3;
        var TARGET = OPTIONS.target;

        wnd.addEventListener('mousedown', function (e) {
            if (e.button == 0) {
                mouseDown = true;
                x_offset = e.x;
                y_offset = e.y;
            }
        });


        wnd.addEventListener('mousemove', function (e) {
            if (mouseDown) {

                if (!mouseMoved && Math.sqrt(Math.pow((e.x - x_offset), 2) + Math.pow((e.y - y_offset), 2)) >= THRESH) {
                    mouseMoved = true;
                    fin.desktop.System.getMousePosition(function (evt) {
                        var y = parseInt(evt.top);
                        var x = parseInt(evt.left);
                        //console.log(evt);

                        if (onDragStart) onDragStart(x-x_offset, y-y_offset);
                    });
                }

                if (mouseMoved)  {
                    fin.desktop.System.getMousePosition(function (evt) {
                        var y = parseInt(evt.top);
                        var x = parseInt(evt.left);
                        //console.log(evt);

                        if (onDrag) onDrag(x-x_offset, y-y_offset);
                    });
                }
            }
        });


        wnd.addEventListener('mouseup', function (e) {
            var initialMouseMoved = mouseMoved;

            if (e.button == 0) {
                if (mouseMoved) {
                    fin.desktop.System.getMousePosition(function (evt) {
                        var y = parseInt(evt.top);
                        var x = parseInt(evt.left);

                        if (onDragEnd) onDragEnd(x-x_offset,y-y_offset);
                    });
                }

                mouseDown = false;
                mouseMoved = false
            }

            if(!initialMouseMoved) {
                fin.desktop.System.getMousePosition(function (evt) {
                    var y = parseInt(evt.top);
                    var x = parseInt(evt.left);
                    if (onClick) onClick(x-x_offset,y-y_offset);
                });
            }
        });
    }

    fin.desktop._dispatchNotificationEvent = function (destinationUuid, destinationName, type, payload) {
        sendMessageToDesktop("dispatch-notification-event", {
            destinationUuid: destinationUuid,
            destinationName: destinationName,
            payload: {
                type: type,
                payload: payload
            }
        });
    };

    fin.desktop._sendActionToNotification = function (destinationName, type, payload) {
        sendMessageToDesktop("send-action-to-notification", {
            destinationName: destinationName,
            payload: {
                type: type,
                payload: payload
            }
        });
    };

})();