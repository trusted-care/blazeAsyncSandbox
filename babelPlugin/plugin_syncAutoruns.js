module.exports = function({types: t}) {
    let autorunCount = 0

    return {
        visitor: {
            Program: {
                enter(path) {
                    autorunCount = 0 // Reset the count for each file
                },
                exit(path) {
                    // Insert the variable declarations at the top of the file
                    for (let i = 0; i < autorunCount; i++) {
                        const declaration = t.variableDeclaration('const', [
                            t.variableDeclarator(
                                t.identifier(`autorunNo_${i}_Finished`),
                                t.newExpression(t.identifier('ReactiveVar'), [t.booleanLiteral(false)]),
                            ),
                        ])

                        path.node.body.unshift(declaration)
                    }
                },
            },
            CallExpression(path) {
                if (
                    (t.isIdentifier(path.node.callee, {name: 'Tracker'}) && t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property, {name: 'autorun'})) ||
                    (t.isThisExpression(path.node.callee.object) && t.isIdentifier(path.node.callee.property, {name: 'autorun'}))
                ) {
                    const firstArg = path.node.arguments[0]

                    if (autorunCount > 0) {
                        // Inserting the first expression
                        firstArg.body.body.unshift(
                            t.ifStatement(
                                t.unaryExpression(
                                    '!',
                                    t.callExpression(
                                        t.memberExpression(
                                            t.identifier(`autorunNo_${autorunCount - 1}_Finished`),
                                            t.identifier('get'),
                                        ),
                                        [],
                                    ),
                                ),
                                t.returnStatement(null),
                            ),
                        )
                    }

                    // Inserting the last expression
                    firstArg.body.body.push(
                        t.expressionStatement(
                            t.callExpression(
                                t.memberExpression(
                                    t.identifier(`autorunNo_${autorunCount}_Finished`),
                                    t.identifier('set'),
                                ),
                                [t.booleanLiteral(true)],
                            ),
                        ),
                    )

                    autorunCount++
                }
            },
        },
    }
}
