var http = require("http"),
    werker = require("../../index"),
    url = require('url');

var pool = werker.pool(__dirname + "/fibonacciWorker.js").max(5).ttl(5000);

http.createServer(function (req, res) {
    var query = url.parse(req.url, true).query;
    var num = query.number || 40;
    pool.worker().fibonacci(num, function (err, fib) {
        if (err) {
            console.error(err.stack);
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end(err.stack || err);
        } else {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end(fib + "");
        }
    });

}).listen(3000, "127.0.0.1");