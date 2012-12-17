var werker = require("../../index");

function fibonacci(n) {
    return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
}

module.exports = werker.worker()
    .method("fibonacci", fibonacci)
    .start();
