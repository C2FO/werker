"use strict";
var comb = require("comb"),
    Promise = comb.Promise,
    PromiseList = comb.PromiseList,
    isFunction = comb.isFunction,
    Queue = comb.collections.Queue,
    merge = comb.merge,
    define = comb.define,
    Pool = comb.collections.Pool,
    LOGGER = comb.logger("werker.pool");


define(Pool, {

    instance: {

        ttlTimeout: 1000,

        /**
         * WorkerPool to create a pool of workers.
         * @constructs
         * @param options
         */
        constructor: function (options) {
            options = options || {};
            if (!options.createWorker || !isFunction(options.createWorker)) {
                throw "c2fo.webapp.workers.WorkerPool : create worker CB required.";
            }
            if (!options.closeWorker || !isFunction(options.closeWorker)) {
                throw "c2fo.webapp.workers.WorkerPool : close worker CB required.";
            }
            options.minObjects = parseInt(options.minWorkers || 0, 10);
            options.maxObjects = parseInt(options.maxWorkers || options.poolSize || 10, 10);
            this.__ttl = options.ttl || 60000;
            this.__deferredQueue = new Queue();
            this._options = options;
            this.__createWorkerCB = options.createWorker;
            this.__closeWorkerCB = options.closeWorker;
            this.__validateWorkerCB = options.validateWroker;
            this._super(arguments);
        },

        __init: function () {
            if (!this.__inited) {
                this.__inited = true;
                this.__setupTimer();
            }
            return this;
        },

        __setupTimer: function () {
            LOGGER.debug("setting up ttl cleaner");
            clearTimeout(this.__ttlTimer);
            var maxTtl = this.__ttl;
            if (maxTtl > -1) {
                var ttlTimeout = this.ttlTimeout;
                this.__ttlTimer = setTimeout(function checkWorkers() {
                    LOGGER.debug("cleaning up workers");
                    var worker, fQueue = this.__freeObjects, workers = fQueue.values, ps = [];
                    for (var i = 0, l = workers.length; i < l; i++) {
                        worker = workers[i];
                        var lastUsed = worker.__lastUsed__;
                        LOGGER.debug("%d workers lifetime is %d", worker.pid, (Date.now() - lastUsed));
                        if (comb.isNumber(lastUsed) && (Date.now() - lastUsed) > maxTtl) {
                            LOGGER.debug("closing %d", worker.pid);
                            ps.push(this.closeWorker(worker));
                            fQueue.remove(worker);
                        }

                    }
                    LOGGER.debug("closing %d workers", ps.length);
                    comb.when(ps).chain(function () {
                        LOGGER.debug("done closing %d workers", ps.length);
                        setTimeout(checkWorkers.bind(this), ttlTimeout);
                    }.bind(this), function (err) {
                        console.error(err);
                        LOGGER.error(err);
                        setTimeout(checkWorkers.bind(this), ttlTimeout);
                    }.bind(this))
                }.bind(this), ttlTimeout);
            }
            return this;
        },

        __stopTimer: function () {
            if (this.__inited) {
                clearTimeout(this.__ttlTimer);
                this.__inited = false;
            }
        },

        /**
         * Checks all deferred worker requests.
         */
        __checkDeferred: function () {
            var fc = this.freeCount, def, defQueue = this.__deferredQueue;
            while (fc-- >= 0 && defQueue.count) {
                def = defQueue.dequeue();
                var conn = this.getObject();
                if (conn) {
                    def.callback(conn);
                } else {
                    break;
                }
                fc--;
            }
        },

        /**
         * Performs a query on one of the worker in this Pool.
         *
         * @return {comb.Promise} A promise to called back with a worker.
         */
        getWorker: function () {
            var ret = new Promise();
            this.__init();
            //todo override getObject to make async so creating a connetion can execute setup sql
            var conn = this.getObject();
            if (!conn) {
                //we need to deffer it
                this.__deferredQueue.enqueue(ret);
            } else {
                ret = comb.when(conn).chain(function (worker) {
                    var index = this.__inUseObjects.indexOf(conn);
                    if (index > -1) {
                        this.__inUseObjects[index] = worker;
                    }
                    worker.__lastUsed__ = Date.now();
                    return worker
                }.bind(this));
            }
            return ret.promise();
        },

        returnObject: function (obj) {
            if (this.count <= this.__maxObjects) {
                this.validate(obj).then(function (valid) {
                    if (valid) {
                        this.__freeObjects.enqueue(obj);
                        var index;
                        if ((index = this.__inUseObjects.indexOf(obj)) > -1) {
                            this.__inUseObjects.splice(index, 1);
                        }
                        this.__checkDeferred();
                    } else {
                        this.removeObject(obj);
                    }
                }.bind(this));
            } else {
                this.removeObject(obj);
            }
        },

        removeWorker: function (conn) {
            this.closeWorker(conn);
            return this.removeObject(conn);
        },

        /**
         * Return a worker to the pool.
         *
         * @param {*} worker the worker to return.
         *
         * @return {*} an adapter specific worker.
         */
        returnWorker: function (worker) {
            this.returnObject(worker);
        },

        createObject: function () {
            return this.createWorker();
        },

        /**
         * Override to implement the closing of all workers.
         *
         * @return {comb.Promise} called when all workers are closed.
         */
        endAll: function () {
            this.__stopTimer();
            this.__ending = true;
            var worker, fQueue = this.__freeObjects, ps = [];
            while ((worker = fQueue.dequeue()) !== undefined) {
                ps.push(this.closeWorker(worker));
            }
            var inUse = this.__inUseObjects;
            for (var i = inUse.length - 1; i >= 0; i--) {
                var worker = inUse[i];
                if (worker) {
                    ps.push(this.closeWorker(worker));
                }
            }
            this.__inUseObjects.length = 0;

            return comb.when(ps);
        },


        /**
         * Override to provide any additional validation. By default the promise is called back with true.
         *
         * @param {*} worker the conneciton to validate.
         *
         * @return {comb.Promise} called back with a valid or invalid state.
         */
        validate: function (worker) {
            var ret = true;
            if (this.__validateWorkerCB) {
                ret = this.__validateWorkerCB(worker);
            }
            return comb.when(ret);
        },

        /**
         * Override to create workers to insert into this WorkerPool.
         */
        createWorker: function () {
            return  this.__createWorkerCB(this._options);
        },

        closeWorker: function (worker) {
            return this.__closeWorkerCB(worker);
        }
    },

    "static": {
        /**@lends c2fo-worker-pool.Pool*/

        create: function (opts) {
            /*jshint newcap:false*/
            return new this(opts);
        },

        isPool: function (obj) {
            return comb.isInstanceOf(obj, this);
        }
    }
}).as(module);

