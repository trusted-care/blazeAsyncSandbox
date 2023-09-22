let numVisitedCounter = 0
let numVisitedClient = 0
let numSkippedBecauseServerCounter = 0

module.exports = function({types: t, template, caller}) {
    let callerInfo
    caller(function(c) {
        callerInfo = c
    })

    let isServer = false

    return {
        visitor: {
            Program: {
                enter(_, state) {
                    isServer = callerInfo?.arch.startsWith('os.')
                },
            },

            Function(path) {
                // We only need this for clients (at the moment), server side isn't reactive / doesn't have Autoruns per default
                if (isServer) {
                    // console.log({numSkippedBecauseServerCounter: ++numSkippedBecauseServerCounter})
                    return
                }
                if (path.node.async) {
                    const initCode = template.ast(`// Store current computation, if any
                        const ____secretCurrentComputation____ = Tracker?.currentComputation || null
                        const ____secretCurrentComputationActive____ = !!Tracker?.active`, {preserveComments: true})

                    path.get('body').unshiftContainer('body', initCode)
                }
            },
            AwaitExpression(path, state) {
                // We only need this for clients (at the moment), server side isn't reactive / doesn't have Autoruns per default
                if (isServer) {
                    return
                }

                // console.log({numVisitedClient: ++numVisitedClient})
                try {
                    // Build your custom code as an AST node
                    const wrapTemplate = template(`
                      await Tracker.withComputation(____secretCurrentComputation____, async () => {
                        return PLACEHOLDER;
                      })
                    `);



                    const wrappedNode = wrapTemplate({
                        PLACEHOLDER: path.node
                    });

                    path.replaceWith(wrappedNode);
                    path.skip();  // This prevents Babel from revisiting nodes inside the try-catch block
                } catch (error) {
                    console.error('Error in AwaitExpression visitor:', error);
                }            },
        },
    }
}
