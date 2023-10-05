const babel = require("@babel/core");
const myPlugin = require("./babelPlugin/plugin");

const sourceCode = `
const finalResult = new ReactiveVar()

const c1 = Tracker.autorun(async(c) => {
    const someDataA = await CollectionA.findOneAsync('my_id')
    const additionalDataB = await CollectionB.findOneAsync(someData.id_collB)
    const additionalDataC = await CollectionB.findOneAsync(someData.id_collC)
    finalResult.set(additionalDataC.finalResult)
})

/**
 * Convoluted nested async functions example
 * @param z
 * @returns {Promise<*>}
 */
async function exampleNestedAsyncAwaitFunc(z) {
    const additionalDataX = await CollectionX.findOne({z: z})
    const findFromY = await CollectionY.findOne({y: additionalDataX.y})
    const zResult = await exampleNestedAsyncAwaitFunc2(findFromY.z1, findFromY.z2)
    return zResult
}

async function exampleNestedAsyncAwaitFunc2(z1, z2) {
    const additionalDataZ1 = await CollectionZ.findOne({z: z1})
    const additionalDataZ2 = await CollectionZ.findOne({z: z1})

    return (additionalDataZ1.coolStuff * additionalDataZ2.coolstuff) / 7
}
`;


// const sourceCode = `
//         async (c) => {
//             const a = await somethingA() && await somethingB() || await somethingC()
//
//             this.state.doesPatientHaveActiveAndCurrentBooking = await this.state.stream.hasActiveAndCurrentBookingAsync()
//             this.state.doesPatientHaveActiveAndCurrentBooking = await this.state.stream.hasActiveAndCurrentBookingAsync()
//         }
// `;


// const sourceCode = `
// async function test() {
//   const a = await this.getA()
//   const b = await this.getB()
//   const c = await this.getC()
//
//   return [a, b, c]
// }
//
// async function getA() {
//   return 'A'
// }
// async function getB() {
//   return 'B'
// }
//
// async function getC() {
//   return 'C'
// }
//
// const result = await test()
// console.log({result})
// `;

const { code } = babel.transform(sourceCode, {
    plugins: [myPlugin]});

console.log(code);
