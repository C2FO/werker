var it = require("it"),
    assert = require("assert"),
    werker = require("../index"),
    comb = require("comb"),
    when = comb.when,
    Promise = comb.Promise;

it.describe("werker",function (it) {


    it.describe("pool", function (it) {

        var sends = [], closes = [], creates = [], validates = [], currPid = 0;
        var pool = werker
            .pool(__dirname + "/./workers/worker1.js")
            .createWorker(function (path) {
                creates.push(arguments);
                return when({
                    pid: currPid++,
                    send: function (message) {
                        sends.push(arguments);
                        process.nextTick(function () {
                            this.__listener({message: [message.__m__]});
                        }.bind(this));
                    },
                    once: function (m, f) {
                        this.__listener = f;
                    }
                });
            })
            .closeWorker(function (worker) {
                closes.push(arguments);
                return when(null);
            })
            .validateWorker(function (worker) {
                validates.push(arguments);
                return when(true);
            })
            .max(4)
            .ttl(500);

        function reset() {
            sends.length = closes.length = creates.length = validates.length = 0;
        }

        it.beforeEach(reset);

        it.should("proxy methods", function () {
            var worker = pool.worker();
            assert.isFunction(worker.hello);
            assert.isFunction(worker.world);
            assert.isFunction(worker.helloSync);
            assert.isFunction(worker.worldSync);
        });

        it.should("create workers", function () {
            var worker = pool.worker();
            return when(
                worker.helloSync(),
                worker.worldSync(),
                worker.hello(),
                worker.world()
            ).chain(function (res) {
                    assert.lengthOf(creates, 4);
                    assert.deepEqual(res, ["helloSync", "worldSync", "hello", "world"]);
                });

        });

        it.should("not create more than the max workers", function () {
            var worker = pool.worker();
            var p = when(
                worker.helloSync(),
                worker.worldSync(),
                worker.hello(),
                worker.world(),
                worker.world()
            );
            assert.lengthOf(creates, 4);
            return p.chain(function (res) {
                assert.deepEqual(res, ["helloSync", "worldSync", "hello", "world", "world"]);
            });

        });

        it.should("remove workers after ttl exipres", function (next) {
            var worker = pool.worker();
            when(
                worker.helloSync(),
                worker.worldSync(),
                worker.hello(),
                worker.world()
            ).chain(function (res) {
                    assert.lengthOf(creates, 4);
                    assert.lengthOf(closes, 0);
                    assert.deepEqual(res, ["helloSync", "worldSync", "hello", "world"]);
                    setTimeout(function () {
                        assert.lengthOf(closes, 4);
                        next(null);
                    }, 1000);
                }, next);
        });

        it.should("return the response from the worker as a promise", function () {
            return pool.worker().hello().chain(function (res) {
                assert.equal(res, "hello");
            });
        });

        it.should("allow passing a callback for responses", function (next) {
            return pool.worker().hello(function (err, res) {
                if (err) {
                    next(err);
                } else {
                    assert.equal(res, "hello");
                    next();
                }
            });
        });


        it.afterEach(pool.close.bind(pool));

    });

    it.describe("worker", function (it) {
        var pool = werker.pool(__dirname + "/./workers/worker1.js");

        it.should("pass options on to worker", function () {
            pool.workerArgs(["hello", 1, true]);
            return pool.worker().args().chain(function (res) {
                assert.deepEqual(res, ["hello", "1", "true"]);
                pool.workerArgs(null);
            });
        });


        it.should("invoke the proper handler", function () {
            var worker = pool.worker();
            return when(
                worker.hello(),
                worker.world(),
                worker.helloSync(),
                worker.worldSync()
            ).chain(function (res) {
                    assert.deepEqual(res, ["world", "hello", "world", "hello"]);
                });
        });

        it.should("allow specification of a default handler", function () {
            var worker = pool.worker();
            return worker.send("hello").chain(function (res) {
                assert.equal(res, "hello");
            });
        });

        it.should("catch throw errors", function (next) {
            var worker = pool.worker();
            worker.throwSync().chain(function () {
                next("Unexpected success!");
            }, function (res) {
                next()
            });
        });

        it.should("catch async errors", function (next) {
            var worker = pool.worker();
            worker.throw().chain(function () {
                next("Unexpected success!");
            }, function (res) {
                next()
            });
        });

        it.should("handle uncaught errors", function (next) {
            var worker = pool.worker();
            worker.uncaught().chain(function () {
                next("Unexpected success!");
            }, function (res) {
                next()
            });
        });

        it.afterEach(pool.close.bind(pool));
    });

}).as(module).run();