const babel = require("@babel/core");
const myPlugin = require("./babelPlugin/plugin");

// const sourceCode = `
//         async (c) => {
//             const a = await somethingA() && await somethingB() || await somethingC()
//
//             this.state.doesPatientHaveActiveAndCurrentBooking = await this.state.stream.hasActiveAndCurrentBookingAsync()
//             this.state.doesPatientHaveActiveAndCurrentBooking = await this.state.stream.hasActiveAndCurrentBookingAsync()
//         }
// `;


const sourceCode = `async function test() {
  const a = await this.getA()
  const b = await this.getB()
  const c = await this.getC()
  
  if (await this.getA()) {
      // do
  } else {
     // else
  }
  
  
  
  return [a, b, c]
}

async function getA() {
  return 'A'
}
async function getB() {
  return 'B'
}

async function getC() {
  return 'C'
}

const result = await test()
console.log({result})
`;

const { code } = babel.transform(sourceCode, {
    plugins: [myPlugin]});

console.log(code);
