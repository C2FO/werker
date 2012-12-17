var werker = require("../../index.js");


module.exports = werker.worker()
    .handler(function (ping) {
        return ping;
    })
    .method("cwd", function () {
        return process.cwd();
    })
    .method("args", function () {
        return process.argv.slice(2);
    })
    .method("uncaught", function (next) {
        process.nextTick(function () {
            throw new Error("throw")
        });
    }, true)
    .method("throw", function (next) {
        next(new Error("throw"));
    }, true)
    .method("throwSync", function () {
        throw new Error("throw");
    })
    .method("helloSync", function () {
        return "world";
    })
    .method("worldSync", function () {
        return "hello";
    })
    .method("hello", function (next) {
        process.nextTick(function () {
            next(null, "world");
        });
    }, true)
    .method("world",function (next) {
        process.nextTick(function () {
            next(null, "hello");
        });
    }, true).start();