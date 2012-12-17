<a name="top"></a>


  [![build status](https://secure.travis-ci.org/C2FO/werker.png)](http://travis-ci.org/C2FO/werker)

#Werker

`werker` is a module that helps in the managing and using of worker processes in node, letting you focus on getting things done.

`werker` is useful if you have CPU intensive tasks that block your node process from doing handling other tasks you can easily push it off to a worker process and let `werker` manage it.

[Here](http://screenr.com/mkM7) is a brief screen cast showing `werker` managing a pool of processes.

Notice how once the request stop `werker` automatically cleans up processes. The code for the screen cast is in the examples directory and at the bottom of this page.


##Installation

`npm install werker`

##Usage

###Writing a `worker`

The `werker` API has two aspects to it, the `worker` API and the `pool` API. In order to create a worker pool lets create a worker!

**`worker()`**

The entry point to writing a worker the `worker` function which returns a worker builder that allows you to define messages that your worker accepts from the parent process.

```
var werker = require("werker");

var worker = werker.worker();

module.exports = worker;

```

**Note** Exporting your worker as the module is required.

**`worker.method(name, fn, async?)`**

Ok that is the base for all `worker`s in worker, but right now it doesnt do anything so lets add some handlers to our worker.

```
worker.method("sayHello", function () {
return "Hello World!";
});
```

So in the above scode snippet we added a `method` to our worker which says whenever the parent process invokes the `sayHello` method run this function.

Well thats great but my code is async! Well we have a solution for that also!

```
worker.method("sayHelloAsync", function (cb) {
process.nextTick(function(){
	cb(null, "Hello World!");
});
}, true);
```

Ok so notice how we passed in true as the last argument to the `method` method so now a `cb` is passed in which you call when all processing is done.

**`worker.methods(methods, async?)`**

You can also specify a group of methods when creating your worker.

```
worker.methods({
sayHello : function sayHello(){
	return "Hello World!";
},

add : function add(one, two){
	return one + two;
}
};)
```

So in the above snippet we define two methods `sayHello` and `add`.

You can also pass in true as the last argument to make the group of methods async

```
worker.methods({
sayHelloAsync : function sayHello(cb){
	process.nextTick(function(){
		cb(null, "Hello World!");
	});
},

addAsync : function add(one, two, cb){
	process.nextTick(function(){
		cb(null, one + two);
	});
}
}, true);

```

**`worker.handler(fn, async?)`**

Well I just want a default handler similar to `process.on("message")` ok to do that you can create a default handler that handles all methods that do not match any methods invoked.

```
worker.handler(function(message){
//do something with your message
});

```

Or alternatively the async version.

```
worker.handler(function(message, done){
//do something with your message
}, true);

```

In the above snippets message will be whatever arguments that are passed into the handler, which we will see in the pool.

**`worker.tearDown(fn)`**

If you have logic that you need to run before your worker is stopped either by the pool or the stop method you can specify a tear down function to run.

```
worker.tearDown(function(){
console.log("tear down");
});
```


**`worker.start()`**

To start your worker (i.e. ensure that it is listening and routing messages) use the `start` method.

```
worker.start(); //now your worker is listening for incoming messages and routing to your messages

```

**`worker.stop()`**

To stop your worker from listening to incoming messages use the `stop()` method.

###All Together

```
var werker = require("werker");


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

```

###Creating a Pool

Ok so we have created a worker so lets create a pool to use our worker with.

**werker.pool(pathToWorker)**

To create a pool use the `werker.pool` method.

```
var werker = require("werker");

var werkers = werker.pool(__dirname + "/myWorker.js");
```

**`pool.ttl(timeToLive)`**

Ok so you setup your pool but you dont want all your workers sitting around forever, so you can specify a `ttl` on your worker. This will ensure that the pool cleans up any workers that have not been used for the `ttl` limit.

```
werkers.ttl(10000);
```

So now our workers will sit around for a max time of `10` seconds.

**Note** By default `werker	` has a `ttl` of `1` minute. If you do not want your workers cleanup up set your `ttl` to `-1`.

**`pool.max(maxNumberOfWorkers)`**

By default `werker` will allow up to `10` worker processes if you wish to increase/lower this limit use the `max` method.


```
werkers.max(100); //now I can get up to 100 workers
```

**`pool.workerArgs(workerArguments)`**

The `werker` pool lets specify arguments to pass to the `worker` process when forking a new one.

```
pool.workerArgs(["hello", "world"]);
```

You can access the arguments by using `process.argv` in the worker.

**`pool.workerOptions(options)`**

By defualt the only option set on a `worker` when forking is the `env` which is set to the current processes env. You can override this by using the `workerOptions` method. For more options click [here](http://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options).

###Getting a worker.

This is where `werker` is different just managing your worker processes manually. `werker` manages the creation/destryoing of worker processes internally allowing you to focus on the task at hand.

```

var myWorker = werkers.worker();

myWorker.sayHello(function(err, response){
console.log(response);
});

Or use the promise API

myWorker.sayHello().then(function(response){
console.log(repsonse);
});

```

**Notice** how the `sayHello` method that we defined in the worker is avaiable to use. All actions defined with the `werker` API are automatically added to the `worker` that you get from the pool.



##Example

So lets create a web server that returns fibonacci numbers.

The worker

```
var werker = require("werker");

function fibonacci(n) {
   return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
}

module.exports = werker.worker()
   .method("fibonacci", fibonacci)
   .start();

```

The server.

```
var http = require("http"),
   werker = require("werker"),
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
```
The video at the top is a demonstration of this sample code.

##Meta

Code: `git clone git://github.com/C2FO/werker.git`
JsDoc: <http://c2fo.github.com/werker>
Website:  <http://c2fo.com> - Twitter: <http://twitter.com/c2fo> - 877.465.4045



