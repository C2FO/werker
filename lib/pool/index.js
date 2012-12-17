/*jshint camelcase:false*/
"use strict";

var comb = require("comb"),
    Promise = comb.Promise,
    when = comb.when,
    merge = comb.merge,
    isString = comb.isString,
    extender = require("extender"),
    Pool = require("./pool"),
    WorkerProxy = require("./worker_proxy"),
    fork = require("child_process").fork,
    LOGGER = comb.logger("werker.pool");

function isPool(obj) {
    return obj instanceof Pool;
}

function createWorkerFromPath(path, args, options) {
    function createWorker() {
        var ret = new Promise();
        var worker = fork(path, args || null, merge({env: process.env}, options || {}));
        worker.on("message", function listeningCb(message) {
            if (message.message === "listening") {
                worker.removeListener("message", listeningCb);
                ret.callback(worker);
            }
        });
        return ret.promise();
    }

    createWorker.args = function (a) {
        args = a;
    };
    createWorker.path = function (p) {
        path = p;
    };
    createWorker.options = function (o) {
        options = o;
    };
    return createWorker;

}

function closeWorker(worker) {
    var ret = new Promise();
    worker.once("exit", function () {
        LOGGER.info("closed %d", worker.pid);
        ret.callback();
    });
    worker.once("error", function (err) {
        ret.errback();
    });
    worker.kill('SIGHUP');
    return ret.promise();
}

function validateWorker() {
    return true;
}

var workerProxy = extender.define(isPool, {

    constructor: function (val) {
        this.pool = val;
        this.__methods = [];
    },


    methods: function (pool, methods) {
        this.__methods = methods;
    },

    method: function (pool, method) {
        this.__methods.push(methods);
    },

    noWrap: {
        worker: function () {
            return WorkerProxy.create(this.pool, this.__methods);
        }
    }
});


module.exports = extender.define(isString, {

    constructor: function (val) {
        this.__options = {closeWorker: closeWorker, createWorker: createWorkerFromPath(val), validateWorker: validateWorker};
        this.__methods = require(val).stop().getMethods();
    },

    createWorker: function (path, fn) {
        this.__options.createWorker = fn;
    },

    validateWorker: function (path, fn) {
        this.__options.validateWorker = fn;
    },

    closeWorker: function (path, fn) {
        this.__options.closeWorker = fn;
    },

    ttl: function (path, ttl) {
        this.__options.ttl = ttl;
    },

    min: function min(path, num) {
        this.__options.minWorkers = num;
    },

    max: function min(path, num) {
        this.__options.maxWorkers = num;
    },

    path: function (path, newPath) {
        this.__options.createWorker.path(newPath);
    },

    workerOptions: function (path, opts) {
        this.__options.createWorker.options(opts);
    },

    workerArgs: function (path, args) {
        this.__options.createWorker.args(args);
    },

    noWrap: {

        close: function (ignore, cb) {
            var ret;
            if (this.__pool) {
                ret = this.__pool.endAll();
            }
            ret.classic(cb);
            return ret;
        },

        worker: function () {
            var proxy = workerProxy(this.pool());
            return proxy.methods(this.__methods).worker();
        },

        pool: function () {
            return this.__pool || (this.__pool = Pool.create(this.__options));
        }
    }
});


