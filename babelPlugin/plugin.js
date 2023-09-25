let numVisitedCounter = 0;
let numVisitedClient = 0;
let numSkippedBecauseServerCounter = 0;

module.exports = function ({ types: t, template, caller }) {
    let callerInfo;
    caller(function (c) {
        callerInfo = c;
    });

    let isServer = false;

    function wrapFollowingStatementsInBlock(path) {
        if (!path.isFunction() || !path.node.async) return;

        let body = path.node.body.body;
        for (let i = 0; i < body.length; i++) {
            let stmt = body[i];
            if (t.isExpressionStatement(stmt) && t.isAwaitExpression(stmt.expression)) {
                if (i < body.length - 1) {
                    const afterAwait = body.splice(i + 1);

                    const wrapper = template(`
                        return Tracker.withComputation(____secretCurrentComputation____, () => {
                            BODY;
                        });
                    `)({ BODY: afterAwait });

                    body.splice(i + 1, 0, wrapper);
                    i += afterAwait.length; // Skip the inserted block
                }
            }
        }
    }

    return {
        visitor: {
            Program: {
                enter(_, state) {
                    isServer = callerInfo?.arch.startsWith('os.');
                },
            },
            Function: function (path) {
                if (isServer) {
                    return;
                }

                if (path.node.async) {
                    const initCode = template.ast(`
                        const ____secretCurrentComputation____ = Tracker?.currentComputation || null;
                    `, { preserveComments: true });

                    path.get('body').unshiftContainer('body', initCode);
                    wrapFollowingStatementsInBlock(path);
                }
            },
        },
    };
};
