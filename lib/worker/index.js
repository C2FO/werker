"use strict";
var comb = require("comb"),
    merge = comb.merge,
    extender = require("extender"),
    argsToArray = comb.argsToArray,
    isArray = comb.isArray,
    LOGGER = comb.logger("werker.worker");

var errorHandler = comb(function errorHandler(message, err) {
    if (message instanceof Error) {
        err = message;
        message = err.message;
    }
    if (isArray(err)) {
        err.forEach(function (err) {
            LOGGER.warn(err.stack || err);
        });
    } else if (err) {
        LOGGER.warn(err.stack || err);
    } else if (message) {
        LOGGER.warn(message);
    } else {
        LOGGER.error(new Error("UNKNOWN"));
    }


    process.send({
        error: true,
        message: message
    });
});

var successHandler = comb(function successHandler(message) {
    process.send({error: false, message: argsToArray(arguments) });
});

var exclude = ["default", "capabilities"];

var workers = [];


function getCapabilites() {
    var ret = [];
    workers.forEach(function (w) {
        ret = ret.concat(w.getMethods());
    });
    return ret;
}


function worker() {

    var exitHandler, title;
    var handlers = {
        capabilities: function () {
            return Object.keys(handlers).filter(function (k) {
                return exclude.indexOf(k) === -1;
            });
        }
    };
    LOGGER.debug("setting up worker %4j", [handlers]);
    var uncaughtHandler = errorHandler.partial("Unexpected error.");

    function disconnectHandler () {
        LOGGER.error("worker %s disconnected from the parent, exiting.", process.pid);
        process.exit(1);
    }

    function codeHandler() {

        function done(err) {
            if (err) {
                errorHandler(err);
                process.exit(1);
            } else {
                process.exit();
            }
        }

        try {
            if (exitHandler) {
                if (exitHandler.length) {
                    exitHandler(done)
                } else {
                    exitHandler();
                    done();
                }
            } else {
                done();
            }
        } catch (e) {
            done(e);
        }
    }

    function processMessage(opts) {
        try {
            LOGGER.debug("GOT MESSAGE %4j", [opts]);
            if (title) {
                process.title = title;
            }
            var m = opts.__m__, handler;
            if (handlers[m]) {
                handler = handlers[m];
            } else if (handlers["default"]) {
                console.warn("No handler found for %s falling back to default", m);
                handler = handlers["default"];
            } else {
                console.error("No handlers found!");
                errorHandler(new Error("No Handlers Found"));
            }
            comb.when(handler.apply(this, opts.args || [])).then(successHandler, errorHandler);
        } catch (e) {
            errorHandler(e);
        }
    }

    var ret = {

        tearDown: function (tearDown) {
            exitHandler = tearDown;
        },

        method: function (m, fn, async) {
            if (async) {
                handlers[m] = function () {
                    var ret = new comb.Promise(), args = argsToArray(arguments);
                    args.push(ret.resolve.bind(ret));
                    fn.apply(this, args);
                    return ret;
                };
            } else {
                handlers[m] = fn;
            }
            return this;
        },

        methods: function (addHandlers, async) {
            for (var i in addHandlers) {
                if (addHandlers.hasOwnProperty(i)) {
                    this.method(i, addHandlers[i], async);
                }
            }
            return this;
        },

        title: function (titl) {
            title = titl;
            return this;
        },

        start: function () {
            if (process.send) {
                LOGGER.debug("starting up worker %d", process.pid);
                process.on("uncaughtException", uncaughtHandler);
                process.on("message", processMessage);
                process.on("disconnect", disconnectHandler);
                process.on("SIGHUP", codeHandler);
                process.send({message: "listening"});
            }
            return this;
        },

        stop: function () {
            LOGGER.debug("stopping up worker %d", process.pid);
            if (process.send) {
                process.removeListener("message", processMessage);
                process.removeListener("uncaughtException", uncaughtHandler);
                process.removeListener("disconnect", disconnectHandler);
                process.removeListener("SIGHUP", codeHandler);
            }
            return this;
        },

        getMethods: function () {
            return handlers.capabilities();
        }
    };

    workers.push(ret);
    return ret;

}


module.exports = extender.define({

    constructor: function () {
        this.__worker = worker();
    },

    method: function (ignore, message, handler, async) {
        this.__worker.method(message, handler, async);
    },

    methods: function (ignore, methods, async) {
        this.__worker.methods(methods, async);
    },

    title: function (ignore, title) {
        this.__worker.title(title);
    },

    handler: function (ignore, fn, async) {
        this.__worker.method("default", fn, async);
    },

    start: function () {
        this.__worker.start();
        this._started = true;
    },

    tearDown: function (ignore, fn) {
        this.__worker.tearDown(fn);
    },


    stop: function () {
        if (this._started) {
            this.__worker.stop();
        }
    },

    noWrap: {
        getMethods: function () {
            return getCapabilites();
        }
    }
});