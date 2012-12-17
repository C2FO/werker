var comb = require("comb"),
    merge = comb.merge,
    argsToArray = comb.argsToArray,
    isFunction = comb.isFunction,
    Promise = comb.Promise,
    extender = require("extender"),
    fork = require("child_process").fork,
    LOGGER = comb.logger("werker"),
    Pool = require("./pool");

var WorkerProxy = comb.define({

    instance: {

        constructor: function (pool, methods) {
            this.pool = pool;
            methods = (this.methods = methods || []);
            methods.forEach(function (m) {
                this[m] = function rpcMethod(message) {
                    var args = argsToArray(arguments), cb;
                    if (isFunction(args[args.length - 1])) {
                        cb = args.pop();
                    }
                    return this.__send({__m__: m, args: args}, cb);
                };
            }, this);
        },

        __send: function (message, cb) {
            LOGGER.debug("getting worker to send message");
            var ret = this.pool.getWorker().chain(function (worker) {
                LOGGER.debug("sending message to worker %d, %4j", worker.pid, message);
                message = merge({__m__: "default"}, message);
                var ret = new Promise();
                worker.once("message", function (results) {
                    LOGGER.debug("got message from worker");
                    if (results.error) {
                        ret.errback(results.message);
                    } else {
                        ret.callback.apply(ret, results.message);
                    }
                });
                worker.send(message);
                ret.both(function () {
                    this.pool.returnWorker(worker);
                }.bind(this));
                return ret.promise();
            }.bind(this));
            ret.classic(cb);
            return ret;
        },

        send: function () {
            var args = argsToArray(arguments), cb;
            if (isFunction(args[args.length - 1])) {
                cb = args.pop();
            }
            return this.__send({args: args}, cb);
        }
    },

    "static": {

        create: function __createWorker(pool, methods) {
            var Worker = this;
            return new Worker(pool, methods);
        }

    }

}).as(module);







