// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by blaze-timers.js.
import { name as packageName } from "meteor/mhidou:blaze-timers";

// Write your tests here!
// Here is an example.
Tinytest.add('blaze-timers - example', function (test) {
    test.equal(packageName, "blaze-timers");
});
