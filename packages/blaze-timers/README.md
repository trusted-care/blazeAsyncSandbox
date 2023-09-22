Blaze timers
===

This package helps you to manage easily your timers (timeouts and intervals). All timers set with this package are cleared when their template in destroyed.

Usage
===

`TemplateInstance.setTimeout(func, delay)`
---

Call a function in the future after waiting for a specified delay.

```
/**
 * @param  {Function} func  The function to run
 * @param  {Number}   delay Number of milliseconds to wait before calling function
 * @return {Object}   The handle returned by `window.setTimeout`
 */

// Example

Template.hello.onCreated(() => {
  // Log `Hello` in the console after one second
  this.helloTimeout = this.setTimeout(() => {
    console.log('Hello');
  }, 1000);
})
```

`TemplateInstance.clearTimeout(id)`
---

Cancel a function call scheduled by `TemplateInstance.setTimeout`.

```
/**
 * @param  {String} id timeout's id
 * @return {Boolean}   true if the timeout exists and false if it doesn't exist
 */

// Example

Template.hello.onCreated(() => {
  this.helloTimeout = this.setTimeout(() => {
    console.log('Hello');
  }, 1000);

  // Cancel the timeout.
  this.clearTimeout(this.helloTimeout);
})
```

`TemplateInstance.setInterval(func, delay)`
---

Call a function repeatedly, with a time delay between calls.

```
/**
 * @param  {Function} func  The function to run
 * @param  {Number}   delay Number of milliseconds to wait between each function call.
 * @return {Object}   The handle returned by `window.setInterval`
 */

// Example

Template.hello.onCreated(() => {
  // Log 'Hello' in the console every second
  this.helloInterval = this.setInterval(() => {
    console.log('Hello');
  }, 1000);
})
```

`TemplateInstance.clearInterval(id)`
---

```
/**
 * Cancel a repeating function call scheduled by `TemplateInstance.setInterval`.
 * @param  {String} id interval's id
 * @return {Boolean}   true if the interval exists and false if it doesn't exist
 */

// Example

Template.hello.onCreated(() => {
  const self = this;
  this.helloInterval = this.setInterval(() => {
    console.log('Hello');
    // Cancel the interval after the first call
    self.clearInterval(self.helloInterval)
  }, 1000);
})
```

`TemplateInstance.clearTimers()`
---

Cancel all timers called by `TemplateInstance.setTimeout` and `TemplateInstance.setInterval`.

```
// Example

Template.hello.onDestroyed(() => {
  // Clear all timers (Optional).
  // NOTE: this callback is already called by default for all templates.
  this.clearTimers();
})
```
