var werker = require("../../index");


module.exports = werker.worker()
    .method("sayHello", function () {
        return "Hello World!";
    })
    .method("add", function (one, two) {
        return one + two;
    })
    .method("asyncAdd",function (one, two, done) {
        process.nextTick(function () {
            done(null, one + two);
        });
    }, true)
    .tearDown(function(){
        console.log("tear down");
    }).start();
