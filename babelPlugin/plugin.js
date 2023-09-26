let numVisitedCounter = 0;
let numVisitedClient = 0;
let numSkippedBecauseServerCounter = 0;

const generate = require("@babel/generator").default;

function truncate(str, length = 100) {
    return str.length > length ? str.slice(0, length) + "..." : str;
}

function log(title = '', path) {
    console.log(title, generate(path.node).code)
}

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
            let containsAwait = false;

            if (t.isExpressionStatement(stmt) && t.isAwaitExpression(stmt.expression)) {
                containsAwait = true;
            } else if (t.isVariableDeclaration(stmt)) {
                for (let declar of stmt.declarations) {
                    if (t.isAwaitExpression(declar.init)) {
                        containsAwait = true;
                        break;
                    }
                }
            }

            if (containsAwait) {
                if (i < body.length - 1) {
                    const afterAwait = body.splice(i + 1);

                    const wrapper = template(`
                    return Tracker.withComputation(____secretCurrentComputation____, async () => {
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
            Function (path) {
                if (isServer) {
                    return;
                }

                console.log("Visiting a", path.type)

                if (path.node.async) {
                    console.log("in block")
                    // Ensure the body is a block statement (for arrow functions with expression bodies)
                    if (!t.isBlockStatement(path.node.body)) {
                        const originalBody = path.node.body;
                        path.node.body = t.blockStatement([t.returnStatement(originalBody)]);
                    }

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
