import { _ } from 'lodash';
import { Blaze } from 'meteor/blaze';
import { Template } from 'meteor/templating';

export const name = 'blaze-timers';

var _super = Template.prototype._getCallbacks;
Template.prototype._getCallbacks = function (which) {
    var callbacks = _super.call(this, which);
    if (which === 'destroyed') {
        callbacks.push(function () {
            this.clearTimers();
        });
    }
    return callbacks;
};

Object.assign(Blaze.TemplateInstance.prototype, {
    /**
     * Call a function in the future after waiting for a specified delay.
     * @param  {Function} func  The function to run
     * @param  {Number}   delay Number of milliseconds to wait before calling function
     * @return {Object}   The handle returned by `window.setTimeout`
     */
    setTimeout(func, delay) {
        const timeout = window.setTimeout(func, delay);

        if (!this.timeouts || !(this.timeouts instanceof Array)) {
            // This is the first timeout
            this.timeouts = [timeout];
        } else {
            this.timeouts.push(timeout);
        }

        return timeout;
    },

    /**
     * Cancel a function call scheduled by `TemplateInstance.setTimeout`.
     * @param  {String} id timeout's id
     * @return {Boolean}   true if the timeout exists and false if it doesn't exist
     */
    clearTimeout(id) {
        const index = this.timeouts ? _.indexOf(this.timeouts, id) : -1;

        window.clearTimeout(id);

        if (index !== -1) {
            this.timeouts.splice(index, 1);
            return true;
        } else {
            return false;
        }
    },

    /**
     * Call a function repeatedly, with a time delay between calls.
     * @param  {Function} func  The function to run
     * @param  {Number}   delay Number of milliseconds to wait between each function call.
     * @return {Object}   The handle returned by `window.setInterval`
     */
    setInterval(func, delay) {
        const interval = window.setInterval(func, delay);

        if (!this.intervals || !(this.intervals instanceof Array)) {
            this.intervals = [interval];
        } else {
            this.intervals.push(interval);
        }

        return interval;
    },

    /**
     * Cancel a repeating function call scheduled by `TemplateInstance.setInterval`.
     * @param  {String} id interval's id
     * @return {Boolean}   true if the interval exists and false if it doesn't exist
     */
    clearInterval(id) {
        const index = this.intervals ? _.indexOf(this.intervals, id) : -1;

        window.clearInterval(id);

        if (index !== -1) {
            this.intervals.splice(index, 1);
            return true;
        } else {
            return false;
        }
    },
    /**
     * Cancel all timers called by `TemplateInstance.setTimeout` and `TemplateInstance.setInterval`.
     */
    clearTimers() {
        if (this.timeouts) {
            this.timeouts.forEach((timeout) => this.clearTimeout(timeout));
        }
        if (this.intervals) {
            this.intervals.forEach((interval) => this.clearInterval(interval));
        }
    }
});
