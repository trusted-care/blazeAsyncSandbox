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

const counter1 = new ReactiveVar(0)
const counter2 = new ReactiveVar(0)

async function getCounter1(){
    await _.sleepAsync(500)
    return Tracker.withComputation(____secretCurrentComputation____, () => {
        return counter1.get()
    })

}

async function setCounter1(val){
    await _.sleepAsync(500)
    return Tracker.withComputation(____secretCurrentComputation____, () => {
        counter1.set(val)
    })
}

async function getCounter2(){
    await _.sleepAsync(500)
    return Tracker.withComputation(____secretCurrentComputation____, () => {
        return counter2.get()
    })
}

async function setCounter2(val){
    await _.sleepAsync(500)
    return Tracker.withComputation(____secretCurrentComputation____, () => {
        counter2.set(val)
    })

}


TemplateController('testTemplate', {
    async onCreated() {
        Meteor.setTimeout(() => {
            counter1.set(1)
        }, 1000)

        this.autorun(async (c) => {
            console.log('onCreatedAutorun start')
            const current1 = await getCounter1()
            await _.sleepAsync(1000)
            console.log('⛱')

            console.log('onCreated autorun, counter 1:', current1)
            await _.sleepAsync(1000)
            console.log('⛱')
            await setCounter2(42)
            console.log('onCreatedAutorun end')
        })
    },
    onRendered() {
        this.autorun(async () => {
            console.log('onRenderedAutorun start')
            await _.sleepAsync(500)
            console.log('⛱')

            const counter1now = await getCounter1()
            await _.sleepAsync(500)
            console.log('⛱')

            const counter2now = await getCounter2()
            console.log('HEEYOOO', counter1now, counter2now)
            console.log('onRenderedAutorun end')
        })
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
