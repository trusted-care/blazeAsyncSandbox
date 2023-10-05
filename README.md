# Blaze Async Sandbox
This is mostly a testbed for our blaze async experiments.

If you want to use the current version of our "Blaze to ASYNC Conversion" stack, the easiest thing to do would be to

- clone this project
- copy the following packages from the `packages` directory to your own projects' `packages` directory in the `convert-to-async` - branch of your repository:
  - `blaze`     - contains the most recent Blaze from Meteor 2.13, plus Radeks' {{#if}}, {{#unless}} and {{#each}} patches
  - `tracker`   - For awaitable autoruns from this PR: https://github.com/meteor/meteor/pull/12805

Babel Plugin from here: [(Tracking async context in client](https://github.com/meteor/meteor/issues/12317#issuecomment-1742941170)

Copy the babel plugin `plugin-trackerAsyncMitigation.js` from the `babelPlugin` folder into a cozy place in your project and update your `.babelrc` like eg. this:

```js
{  
    "presets": ["@babel/preset-env"],  
    "plugins": ["./babelPlugin/plugin-trackerAsyncMitigation.js"]  
}
```

***NOTE:*** you have to delete your meteor build cache once (eg. run `meteor reset` once) after adding the babel plugin in order to get its effects applied to your codebase.

Then - happy migration! 😄 🐧
