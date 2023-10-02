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

        await this.autorunAsync(async () => {
            console.log('autorun 1, 0')
            await sleepAsync(100)
            console.log('autorun 1, 1')

            await sleepAsync(100)
            console.log('autorun 1, 2')

            await sleepAsync(100)
            console.log('/autorun 1')
        })

        // console.log({autorunPromise})

        await this.autorunAsync(async () => {
            console.log('autorun 2, 0')
            await sleepAsync(100)
            console.log('autorun 2, 1')

            await sleepAsync(100)
            console.log('autorun 2, 2')

            await sleepAsync(100)
            console.log('/autorun 2')
        })

        await this.autorunAsync(async () => {
            console.log('autorun 3, 0')
            await sleepAsync(100)
            console.log('autorun 3, 1')

            await sleepAsync(100)
            console.log('autorun 3, 2')

            await sleepAsync(100)
            console.log('/autorun 3')
        })

        console.log('/onCreated')

    },
    async onRendered() {
        console.log('onRendered')
        //
        // await Tracker.autorunAsync(async () => {
        //     console.log('autorun 3, 0')
        //     await sleepAsync(100)
        //     console.log('autorun 3, 1')
        //
        //     await sleepAsync(100)
        //     console.log('autorun 3, 2')
        //
        //     await sleepAsync(100)
        //     console.log('/autorun 3')
        // })

        console.log('/onRendered')

    }

})