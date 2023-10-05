import './trackerExperiments.html'

/**
 * Helper for easy sleeping & ASYNC testing
 */
async function sleepAsync(i = 100) {
    return new Promise((resolve, reject) => {
        Meteor.setTimeout((i) => {
            resolve();
        }, i, i);
    })
}

/**
 * Sorry for not going all vanilla on the templates but we use - and I am used - to
 * TemplateController. I think it'll work good enough for what we're checking - and Tracking! :)
 */
TemplateController('trackerExperiments', {

    async onCreated() {
        console.log('onCreated')

        await this.autorun(async () => {
            console.log('autorun 1, 0')
            await sleepAsync(100)
            console.log('autorun 1, 1')

            await sleepAsync(100)
            console.log('autorun 1, 2')

            await sleepAsync(100)
            console.log('/autorun 1')
        }).firstRunPromise

        await this.autorun(async () => {
            console.log('autorun 2, 0')
            await sleepAsync(100)
            console.log('autorun 2, 1')

            await sleepAsync(100)
            console.log('autorun 2, 2')

            await sleepAsync(100)
            console.log('/autorun 2')
        }).firstRunPromise

        await this.autorun(async () => {
            console.log('autorun 3, 0')
            await sleepAsync(100)
            console.log('autorun 3, 1')

            await sleepAsync(100)
            console.log('autorun 3, 2')

            await sleepAsync(100)
            console.log('/autorun 3')
        }).firstRunPromise

        console.log('/onCreated')

    },
    async onRendered() {
        console.log('onRendered')

        // This'll not work: it'll be executed immediately after the first await yield-ed in .onCreated().
        // The blaze lifecycle callbacks aren't async-aware & don't await their async functions.

        // await Tracker.autorunAsync(async () => {
        //     console.log('autorun 4, 0')
        //     await sleepAsync(100)
        //     console.log('autorun 4, 1')
        //
        //     await sleepAsync(100)
        //     console.log('autorun 4, 2')
        //
        //     await sleepAsync(100)
        //     console.log('/autorun 4')
        // }).firstRunPromise

        console.log('/onRendered')

    }

})