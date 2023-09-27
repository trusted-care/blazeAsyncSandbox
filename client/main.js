import _ from 'lodash'

import { Meteor } from 'meteor/meteor'
// import { App } from '/imports/ui/App'

import './main.html'

/**
 * Helper for easy sleeping & ASYNC testing
 */
_.sleepAsync = async function sleepAsync(i) {
    return new Promise((resolve, reject) => {
        Meteor.setTimeout((i) => {
            resolve();
        }, i, i);
    })
}


TemplateController('testTemplate', {
    async onCreated() {
        /**
         * Let's see whether Tracker.withComputation really cleans up behind it on time
         */

        // Autorun A
        let computationACounter = 1
        this.autorun(async (c) => {
            c.COMPUTATION_NAME = `A ${computationACounter++}`
            console.log("A", Tracker.currentComputation?.COMPUTATION_NAME)
            await Tracker.withComputation(c, async () => {
                console.log('B', Tracker.currentComputation?.COMPUTATION_NAME)
                await _.sleepAsync(200)
                await Tracker.withComputation(c, async () => {
                    console.log('C', Tracker.currentComputation?.COMPUTATION_NAME)
                    await _.sleepAsync(200)
                    await Tracker.withComputation(c, async () => {
                        console.log('D', Tracker.currentComputation?.COMPUTATION_NAME)
                        return _.sleepAsync(200)
                    })
                })
            })

            console.log('E', Tracker.currentComputation?.COMPUTATION_NAME)
        })

        // see whether we can detect neutrinos / Tracker.currentComputations where we don't want them?
        // let checkCount = 0
        // const logCurrentComputationIfExists = function() {
        //     if (Tracker.currentComputation) {
        //         console.log('🚝🎏🏢🚝🎏🏢🚝🎏🏢 FOUND A COMPUTATION!!! ', Tracker.currentComputation?.COMPUTATION_NAME)
        //     }
        //     checkCount +=1
        //     if (0 === checkCount % 500) {
        //         console.log('checking for secret computations', checkCount)
        //     }
        // }
        // Meteor.setInterval(logCurrentComputationIfExists, 0)

        // this.autorun(async (c) => {
        //     c.COMPUTATION_NAME = 'B'
        //     console.log('G', Tracker.currentComputation?.COMPUTATION_NAME)
        //     await _.sleepAsync(1000)
        //     console.log('H', Tracker.currentComputation?.COMPUTATION_NAME)
        // })

    },
    onRendered() {
    }
})









// SUPERGLOBAL = 0
//
// Meteor.startup(async () => {
//     container = document.getElementById('react-target')
//     const root = createRoot(container)
//     root.render(<App/>)
//
//     // destroy global in this thread
//     Meteor.setInterval(() => {
//         SUPERGLOBAL = 'from outside!!!!'
//     }, 200)
//
//     console.log('0', SUPERGLOBAL)
//
//     const emptyPromises = []
//
//     emptyPromises.push(awaitSomethingWithContext(SUPERGLOBAL))
//     SUPERGLOBAL += 1
//     console.log('A', SUPERGLOBAL)
//     emptyPromises.push(awaitSomethingWithContext(SUPERGLOBAL))
//     SUPERGLOBAL += 1
//     console.log('B', SUPERGLOBAL)
//     emptyPromises.push(awaitSomethingWithContext(SUPERGLOBAL))
//     SUPERGLOBAL += 1
//     console.log('C', SUPERGLOBAL)
// })
//
// /**
//  * We wanna wait & we wanna be able to keep SUPERGLOBAL around!
//  * @param SUPERGLOBAL
//  * @returns {Promise<unknown>}
//  */
// const awaitSomethingWithContext = async function(SUPERGLOBAL) {
//     const context = {
//         ourSuperglobal: SUPERGLOBAL,
//     }
//     return await newScope(async () => {
//         // TODO: fix up dexie types to understand psd extension
//         // @ts-ignore
//         console.log({SUPERGLOBAL, 'PSD.prop': PSD.ourSuperglobal})
//
//         await new Promise((resolve, reject) => {
//             Meteor.setInterval(() => {
//                 resolve()
//             }, 500)
//         }).then(() => {
//             console.log('IN THEN', {SUPERGLOBAL, 'PSD.prop': PSD.ourSuperglobal})
//         })
//     }, context)
// }
