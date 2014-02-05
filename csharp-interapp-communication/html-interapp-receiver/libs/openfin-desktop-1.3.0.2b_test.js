/**
 * name:    OpenFin Desktop JavaScript Adapter
 * version: 1.3.0.0b
 */


var fin = fin || {};

fin.desktop = fin.desktop || {};


(function () {

    console.error("STARTING DESKTOP.JS");

    var mainCallback;
    var isConnected = false;

    fin.desktop.main = function (callback) {
        mainCallback = callback;
        if (isConnected && mainCallback) {
            mainCallback.call(window);
        }
    };

    console.error('Creating WebSocket');

    var socket = new WebSocket('ws://127.0.0.1:' + (fin.desktop._websocket_port ? fin.desktop._websocket_port : '9696'));

    socket.onopen = function () {
        console.error('WebSocket opened in App with auth token');
        var connectedMessage = JSON.stringify({
            action: 'request-authorization',
            payload: {
                type: 'application-token',
                authorizationToken: fin.desktop._application_token
            }
        });

        console.error("Attempting handshake with WebSocket server.");
        socket.send(connectedMessage);
    };

    socket.onmessage = function (event) {

        var message = JSON.parse(event.data);
        var action = message.action;
        var correlationId = message.correlationId;
        var payload = message.payload;

        console.error("message received: action: " + action + " correlationId: " + correlationId);
		
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
            dispatchDesktopMessageToCallbacks(message);
        } else if (action == "subscriber-added") {
            dispatchToSubscribeListeners(payload.uuid, payload.topic);
        } else if (action == "subscriber-removed") {
            dispatchToUnsubscribeListeners(payload.uuid, payload.topic);
        }

    };

    socket.onerror = function () {
        console.error("Error establishing WebSocket connection");
    };

    socket.onclose = function () {
        console.error("WebSocket connection closed");
    };


    var messageId = 0;

    var messageCallbackMap = {};

    function fireMessageCallback(correlationId, response) {
        if (messageCallbackMap[correlationId]) {
            messageCallbackMap[correlationId].call(window, response);
            delete messageCallbackMap[correlationId];
        }
    }

    function sendMessageToDesktop(action, payload, callback) {
        if (isConnected) {
            var messageObject = {
                action: action,
                payload: payload
            };

            if (callback && typeof callback == "function") {
                messageCallbackMap[messageId] = callback;
                messageObject.messageId = messageId;
                messageId++;
            }

            var message = JSON.stringify(messageObject);

            socket.send(message);
        }
    }


    function respondToPing(pingId) {
        console.error("Responding to ping");
        sendMessageToDesktop("pong", {
            correlationId: pingId
        });
    }


    var desktopSystemBusCallbackMap = {
        "system": {},
        "application": {},
        "window": {},
        "message": {}
    };

    function dispatchDesktopMessageToCallbacks(message) {
		var payload = message.payload;
        var topic = payload.systemTopic;
        var action = payload.action;
		console.error("dispatch system topic:" + topic + " action:" + action);
        dispatchSystemBusMessageToCallbacks(topic, action, payload.payload);
    }

    function dispatchSystemBusMessageToCallbacks(topic, action, message) {
        var map = desktopSystemBusCallbackMap[topic];

        if (map["*"]) {
            map["*"].forEach(function (callback) {
                callback.call(window, message, action);
            });
        }

        if (map[action]) {
            map[action].forEach(function (callback) {
                callback.call(window, message, action);
            });
        }
    }

    function addSystemBusCallback(topic, action, callback) {
        var map = desktopSystemBusCallbackMap[topic];
        map[action] = map[action] || [];
        if (map[action].length == 0) {
            var payload = {
                topic: topic,
                action: action
            };
            sendMessageToDesktop("subscribe-to-system-message", payload, undefined);
        }
        map[action].push(callback);
    }

    function removeSystemBusCallback(topic, action, callback) {
        var map = desktopSystemBusCallbackMap[topic];
        if (map[action]) {
            var index = map[action].indexOf(callback);
            if (index != -1) {
                map[action].splice(index,1);
                if (map[action].length == 0) {
                    var payload = {
                        topic: topic,
                        action: action
                    };
                    sendMessageToDesktop("unsubscribe-to-system-message", payload, undefined);
                }
            }
        }
    }

    var interAppBusCallbackMap = {};

    function dispatchMessageToCallbacks(senderUuid, topic, message) {
        console.error("Dispatching message to callbacks from " + senderUuid + " on " + topic);

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
                    cb.call(window, message);
                });
            }
        }

        appMap = interAppBusCallbackMap[senderUuid];

        if (appMap) {
            topicMap = appMap[topic];
            if (topicMap) {
                //var msgObj = JSON.parse(message);
                topicMap.forEach(function (cb) {
                    cb.call(window, message);
                });
            }
        }
    }

    fin.desktop.System = {
        getDeviceId: function (callback) {
            sendMessageToDesktop('get-device-id', {}, callback);
        },
        getVersion: function (callback) {
            sendMessageToDesktop('get-version', {}, callback);
        },
        getCommandLineArguments: function (callback) {
            sendMessageToDesktop('get-command-line-arguments', {}, callback);
        },
        getProcessList: function (callback) {
            sendMessageToDesktop('process-snapshot', {}, callback);
        },
        getLog: function (logName, callback) {
            sendMessageToDesktop('view-log', {
                name: logName
            }, callback);
        },
        getLogList: function (callback) {
            if (callback) {
                sendMessageToDesktop('list-logs', {}, function (event) {
                    var logArray = event.data;

                    logArray.forEach(function (log) {
                        var dateString = log.date;
                        log.date = new Date(dateString);
                    });

                    callback.call(window, event);
                });
            } else {
                sendMessageToDesktop('list-logs', {}, callback);
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
        getProxySettings: function (callback) {
            sendMessageToDesktop('get-proxy-settings', {}, callback);
        },
        updateProxySettings: function (type, proxyAddress, proxyPort, callback) {
            sendMessageToDesktop('update-proxy', {
                type: type,
                proxyAddress: proxyAddress,
                proxyPort: proxyPort
            }, callback);
        },
        clearCache: function (options, callback) {
            sendMessageToDesktop('clear-cache', {
                cache: options.cache,
                cookies: options.cookies,
	            localStorage: options.localStorage,
		        appcache: options.appcache,
                userData: options.userData
            }, callback);
        },
        deleteCacheOnRestart: function (callback) {
            sendMessageToDesktop('delete-cache-request', {}, callback);
        },
        installStartIcon: function (options, callback) {
            sendMessageToDesktop('install-start-icon', {
				enabledIcon: options.enabledIcon,
				disabledIcon: options.disabledIcon,
                hoverIcon: options.hoverIcon
			}, callback);
        },
        removeStartIcon: function (callback) {
            sendMessageToDesktop('remove-start-icon', {}, callback);
        },
        showStartWindow: function (callback) {
            sendMessageToDesktop('show-start-window', {}, callback);
        },
        hideStartWindow: function (callback) {
            sendMessageToDesktop('hide-start-window', {}, callback);
        },
        getMonitorInfo: function (callback) {
            sendMessageToDesktop('get-monitor-info', {}, callback);
        },
        getAllWindows: function (callback) {
            sendMessageToDesktop('get-all-windows', {}, callback);
        },
        getMousePosition: function (callback) {
            sendMessageToDesktop('get-mouse-position', {}, callback);
        },
        showDeveloperTools: function (applicationUuid, windowName, callback) {
            sendMessageToDesktop('show-developer-tools', {
                uuid: applicationUuid,
                name: windowName
            }, callback);
        },
        exit: function (callback) {
            sendMessageToDesktop('exit-desktop', {}, callback);
        },
        addActionListener: function (action, callback) {
            addSystemBusCallback("system", action, callback);
        },
        removeActionListener: function (action, callback) {
            removeSystemBusCallback("system", action, callback);
        },
        openUrlWithBrowser: function (url, callback) {
            sendMessageToDesktop('open-url-with-browser', {
                url: url
            }, callback);
        }
    };

    fin.desktop.Application = function (options, callback) {
        var opt = deepObjCopy(options);

        this.name = opt.name;
        this.uuid = opt.uuid;

        opt.defaultHeight = Math.floor(opt.defaultHeight);
        opt.defaultWidth = Math.floor(opt.defaultWidth);
        opt.defaultTop = Math.floor(opt.defaultTop);
        opt.defaultLeft = Math.floor(opt.defaultLeft);


        if (!opt._noregister) {
            sendMessageToDesktop('create-application', opt, callback);
        }

        this.window = new fin.desktop.Window({
            _noregister: true,
            _nocontentwindow: true,
            uuid: this.uuid,
            name: this.uuid
        });
    };


    fin.desktop.Application.addActionListener = function (action, callback) {
        addSystemBusCallback("application", action, callback);
    };

    fin.desktop.Application.removeActionListener = function (action, callback) {
        removeSystemBusCallback("application", action, callback);
    };

    fin.desktop.Application.wrap = function (uuid) {
        return new fin.desktop.Application({
            uuid: uuid,
            _noregister: true
        });
    };

    fin.desktop.Application.getCurrentApplication = function () {
        if (!this._instance) {
            this._instance = fin.desktop.Application.wrap(fin.desktop._app_uuid);
        }
        return this._instance;
    };

    fin.desktop.Application.prototype = {
        run: function (callback) {
            sendMessageToDesktop('run-application', {
                uuid: this.uuid
            }, callback);
        },
        restart: function (callback) {
            sendMessageToDesktop('restart-application', {
                uuid: this.uuid
            }, callback);
        },
        close: function (callback) {
            sendMessageToDesktop('close-application', {
                uuid: this.uuid
            }, callback);
        },
        terminate: function (callback) {
            sendMessageToDesktop('terminate-application', {
                uuid: this.uuid
            }, callback);
        },
        wait: function (callback) {
            sendMessageToDesktop('wait-for-hung-application', {
                uuid: this.uuid
            }, callback);
        },
        remove: function (callback) {
            sendMessageToDesktop('remove-application', {
                uuid: this.uuid
            }, callback);
        },
        getWindow: function () {
            return this.window;
        }
    };

    var windowList = {};

    fin.desktop.Window = function (options, callback) {
        var opt = deepObjCopy(options);


        opt.defaultHeight = Math.floor(opt.defaultHeight);
        opt.defaultWidth = Math.floor(opt.defaultWidth);
        opt.defaultTop = Math.floor(opt.defaultTop || 100 );
        opt.defaultLeft = Math.floor(opt.defaultLeft || 100);

        this.connected = opt.connected;
        this.name = opt.name;
        this.app_uuid = opt.uuid;


        if (!opt._noregister) {

            var me = this;

            opt.uuid = fin.desktop._app_uuid;
            this.app_uuid = opt.uuid;
            var url = opt.url;

            sendMessageToDesktop('register-child-window-settings', opt, function (evt) {
                if(evt.success != true) {
                    console.error("Could not create window: " + evt.reason);
                    me.name = undefined;
                    me.app_uuid = undefined;
                    return;
                }
                me.contentWindow = window.open(url, me.name);
                windowList[me.name] = me.contentWindow;

                if (callback) callback.call(me);
            });

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

    fin.desktop.Window.addActionListener = function (action, callback) {
        addSystemBusCallback("window", action, callback);
    };

    fin.desktop.Window.removeActionListener = function (action, callback) {
        removeSystemBusCallback("window", action, callback);
    };

    fin.desktop.Window.prototype = {
        show: function (callback) {
            sendMessageToDesktop('show-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        showAt: function (left, top, toggle, callback) {
            sendMessageToDesktop('show-at-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left),
				toggle: toggle
            }, callback);
        },
        hide: function (callback) {
            sendMessageToDesktop('hide-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        close: function(callback) {
            sendMessageToDesktop('close-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        minimize: function (callback) {
            sendMessageToDesktop('minimize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        maximize: function (callback) {
            sendMessageToDesktop('maximize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        restore: function (callback) {
            sendMessageToDesktop('restore-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        focus: function (callback) {
            sendMessageToDesktop('focus-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        blur: function (callback) {
            sendMessageToDesktop('blur-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        getWindowState: function (callback) {
            sendMessageToDesktop('get-window-state', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        getWindowBounds: function (callback) {
            sendMessageToDesktop('get-window-bounds', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        moveTo: function (left, top, callback) {
            sendMessageToDesktop('move-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left)
            }, callback);
        },
        moveBy: function (deltaLeft, deltaTop, callback) {
            sendMessageToDesktop('move-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaTop: Math.floor(deltaTop),
                deltaLeft: Math.floor(deltaLeft)
            }, callback);
        },
        resizeTo: function (width, height, callback) {
            sendMessageToDesktop('resize-window', {
                uuid: this.app_uuid,
                name: this.name,
                width: Math.floor(width),
                height: Math.floor(height)
            }, callback);
        },
        resizeBy: function (deltaWidth, deltaHeight, anchor, callback) {
            sendMessageToDesktop('resize-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaWidth: Math.floor(deltaWidth),
                deltaHeight: Math.floor(deltaHeight),
                anchor: anchor
            }, callback);
        },
        isShowing: function (callback) {
            sendMessageToDesktop('is-window-showing', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        bringToFront: function (callback) {
            sendMessageToDesktop('bring-window-to-front', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        updateOptions: function (options, callback) {
            sendMessageToDesktop('update-window-options', {
                uuid: this.app_uuid,
                name: this.name,
                options: options
            }, callback);
        },
        animate: function (transitions, options, callback) {
            sendMessageToDesktop('animate-window', {
                uuid: this.app_uuid,
                name: this.name,
                transitions: transitions,
                options: options
            }, callback);
        },
        getNativeWindow: function () {
            return this.contentWindow;
        },
        joinGroup: function (target, callback) {
            sendMessageToDesktop('join-window-group', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: target.name
            }, callback);
        },
        mergeGroups: function (target, callback) {
            sendMessageToDesktop('merge-window-groups', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: target.name
            }, callback);
        },
        leaveGroup: function (callback) {
            sendMessageToDesktop('leave-window-group', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        }
    };


    fin.desktop.Gadget = function (options, callback) {
        var opt = deepObjCopy(options);
        opt.frame = false;
        opt.draggable = true;
        opt.resizable = false;
        opt.alwaysOnBottom = true;

        fin.desktop.Window.call(this, opt, callback);
    };

    fin.desktop.Gadget.prototype = {
        show: function (callback) {
            sendMessageToDesktop('show-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        showAt: function (left, top, toggle, callback) {
            sendMessageToDesktop('show-at-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left),
				toggle: toggle
            }, callback);
        },
        hide: function (callback) {
            sendMessageToDesktop('hide-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        close: function(callback) {
            sendMessageToDesktop('close-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        minimize: function (callback) {
            sendMessageToDesktop('minimize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        maximize: function (callback) {
            sendMessageToDesktop('maximize-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        restore: function (callback) {
            sendMessageToDesktop('restore-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        focus: function (callback) {
            sendMessageToDesktop('focus-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        blur: function (callback) {
            sendMessageToDesktop('blur-window', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        isShowing: function (callback) {
            sendMessageToDesktop('is-window-showing', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        getWindowState: function (callback) {
            sendMessageToDesktop('get-window-state', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        getWindowBounds: function (callback) {
            sendMessageToDesktop('get-window-bounds', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        moveTo: function (left, top, callback) {
            sendMessageToDesktop('move-window', {
                uuid: this.app_uuid,
                name: this.name,
                top: Math.floor(top),
                left: Math.floor(left)
            }, callback);
        },
        moveBy: function (deltaLeft, deltaTop, callback) {
            sendMessageToDesktop('move-window-by', {
                uuid: this.app_uuid,
                name: this.name,
                deltaTop: Math.floor(deltaTop),
                deltaLeft: Math.floor(deltaLeft)
            }, callback);
        },
        resizeTo: function (width, height, callback) {
            sendMessageToDesktop('resize-window', {
                uuid: this.app_uuid,
                name: this.name,
                width: Math.floor(width),
                height: Math.floor(height)
            }, callback);
        },
        bringToFront: function (callback) {
            sendMessageToDesktop('bring-window-to-front', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
        },
        getNativeWindow: function () {
            return this.contentWindow;
        },
        joinGroup: function (wnd, callback) {
            sendMessageToDesktop('join-window-group', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: wnd.name
            }, callback);
        },
        mergeGroups: function (wnd, callback) {
            sendMessageToDesktop('merge-window-groups', {
                uuid: this.app_uuid,
                name: this.name,
                groupingWindowName: wnd.name
            }, callback);
        },
        leaveGroup: function (callback) {
            sendMessageToDesktop('leave-window-group', {
                uuid: this.app_uuid,
                name: this.name
            }, callback);
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


        fin.desktop.Flyout = function (options, callback) {

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
            });

            window.addEventListener('click', function () {
                me.hide();
            })
        };

        fin.desktop.Flyout.prototype = {
            show: function (callback) {
                sendMessageToDesktop('show-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            showAt: function (left, top, toggle, callback) {
                sendMessageToDesktop('show-at-window', {
                    uuid: this.app_uuid,
                    name: this.name,
                    top: Math.floor(top),
                    left: Math.floor(left),
                    toggle: toggle
                }, callback);
            },
            hide: function (callback) {
                sendMessageToDesktop('hide-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            close: function (callback) {
                sendMessageToDesktop('close-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            minimize: function (callback) {
                sendMessageToDesktop('minimize-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            maximize: function (callback) {
                sendMessageToDesktop('maximize-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            restore: function (callback) {
                sendMessageToDesktop('restore-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            focus: function (callback) {
                sendMessageToDesktop('focus-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            blur: function (callback) {
                sendMessageToDesktop('blur-window', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            isShowing: function (callback) {
                sendMessageToDesktop('is-window-showing', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            getWindowState: function (callback) {
                sendMessageToDesktop('get-window-state', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            getWindowBounds: function (callback) {
                sendMessageToDesktop('get-window-bounds', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            moveTo: function (left, top, callback) {
                sendMessageToDesktop('move-window', {
                    uuid: this.app_uuid,
                    name: this.name,
                    top: Math.floor(top),
                    left: Math.floor(left)
                }, callback);
            },
            moveBy: function (deltaLeft, deltaTop, callback) {
                sendMessageToDesktop('move-window-by', {
                    uuid: this.app_uuid,
                    name: this.name,
                    deltaTop: Math.floor(deltaTop),
                    deltaLeft: Math.floor(deltaLeft)
                }, callback);
            },
            resizeTo: function (width, height, callback) {
                sendMessageToDesktop('resize-window', {
                    uuid: this.app_uuid,
                    name: this.name,
                    width: Math.floor(width),
                    height: Math.floor(height)
                }, callback);
            },
            bringToFront: function (callback) {
                sendMessageToDesktop('bring-window-to-front', {
                    uuid: this.app_uuid,
                    name: this.name
                }, callback);
            },
            getNativeWindow: function () {
                return this.contentWindow;
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

    /**
     * @class Notification represents a window on the desktop which is shown briefly to the user.
     * A notification is typically used to alert the user of some important event which requires
     * his or her attention.
     *
     * @constructor
     * @param {string} url
     */

    fin.desktop.Notification = function(url) {
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
    fin.desktop.Notification.prototype = {
        show: function(message, callback) {
            sendMessageToDesktop("create-notification", {
                uuid: fin.desktop._app_uuid,
                message: message,
                url: this.url
            }, callback);
        }
    };

    fin.desktop.Notification.getNotificationInfo = function (callback) {
        sendMessageToDesktop('get-notification-info', {}, callback);
    };

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

    fin.desktop.InterApplicationBus.addActionListener = function (action, callback) {
        addSystemBusCallback("message", action, callback);
    };

    fin.desktop.InterApplicationBus.removeActionListener = function (action, callback) {
        removeSystemBusCallback("message", action, callback);
    };

    var subscribeCallbacks = [];

    fin.desktop.InterApplicationBus.addSubscribeListener = function (callback) {
        subscribeCallbacks.push(callback);
    };

    fin.desktop.InterApplicationBus.removeSubscribeListener = function (callback) {
        var index = subscribeCallbacks.indexOf(callback);
        subscribeCallbacks.splice(index,1);
    };

    var unsubscribeCallbacks = [];

    fin.desktop.InterApplicationBus.addUnsubscribeListener = function (callback) {
        unsubscribeCallbacks.push(callback);
    };

    fin.desktop.InterApplicationBus.removeUnsubscribeListener = function (callback) {
        var index = unsubscribeCallbacks.indexOf(callback);
        unsubscribeCallbacks.splice(index,1);
    };

    function dispatchToSubscribeListeners(uuid, topic) {
        unsubscribeCallbacks.forEach(function (callback) {
            callback({
                uuid: uuid,
                topic: topic
            });
        });
    }

    function dispatchToUnsubscribeListeners(uuid, topic) {
        unsubscribeCallbacks.forEach(function (callback) {
            callback({
                uuid: uuid,
                topic: topic
            });
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


})();