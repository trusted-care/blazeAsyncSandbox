const babel = require("@babel/core");
const myPlugin = require("./babelPlugin/plugin");

const sourceCode = `/**
 * This is the file to import if you want to make sure that in your file all the globals we need are defined.
 *
 * This includes the following:
 *
 * 00_namespace.js          - Loggers.*
 * _defaultSettings.js      - public & private settings have been properly initialized & extended with defaults
 * _lodash.js               - lodash has been made global
 *
 * on the client:
 *
 * /imports/ui/lib/meteorCordovaPlatform.js     - for Meteor.isIos, Meteor.isAndroid and Meteor.isIPad
 */

import './00_globals'
import './00_namespace'
import './_defaultSettings'
import './_lodash'

if (Meteor.isClient) {
    require('/imports/ui/lib/meteorCordovaPlatform')

    async function test() {
        const a = await this.getA()
        const b = await this.getB()
        const c = await this.getC()
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
}
`;

const { code } = babel.transform(sourceCode, {
    plugins: [myPlugin]});

console.log(code);
