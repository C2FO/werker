var werker = require("../../index"),
    comb = require("comb");

//require("comb").logger.configure();

var pool = werker.pool(__dirname + "/worker.js");

var worker = pool.worker();

function errorHandler(err) {
    console.error(err.stack || err);
}

worker.sayHello().then(function (res) {
    console.log("SayHello = %s", res);
    worker.add(1, 2).then(function (res) {
        console.log("Add = %d", res);
        worker.asyncAdd(1, 2, function (err, res) {
            if (err) {
                return errorHandler(err);
            }
            console.log("AsyncAdd = %d", res);
            pool.close(function (err) {
                if (err) {
                    return errorHandler(err);
                    x
                }
                console.log("All done!");
            });
        });
    }, errorHandler);
});





