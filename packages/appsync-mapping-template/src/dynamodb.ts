import {
    obj, ref, Expression, ReferenceNode, StringNode,
    IntNode, FloatNode, str, ObjectNode, compoundExpression,
    set, list, forEach, ifElse, qref, iff, raw
} from './ast';

export class DynamoDBMappingTemplate {
    /**
     * Create a put item resolver template.
     * @param keys A list of strings pointing to the key value locations. E.G. ctx.args.x (note no $)
     */
    public static putItem({ key, attributeValues, condition }: {
        key: ObjectNode,
        attributeValues: Expression,
        condition?: ObjectNode
    }): ObjectNode {
        return obj({
            version: str('2017-02-28'),
            operation: str('PutItem'),
            key,
            attributeValues,
            condition
        })
    }

    /**
     * Create a get item resolver template.
     * @param key A list of strings pointing to the key value locations. E.G. ctx.args.x (note no $)
     */
    public static getItem({ key }: {
        key: ObjectNode
    }): ObjectNode {
        return obj({
            version: str('2017-02-28'),
            operation: str('GetItem'),
            key
        })
    }

    /**
     * Create a delete item resolver template.
     * @param key A list of strings pointing to the key value locations. E.G. ctx.args.x (note no $)
     */
    public static deleteItem({ key }: {
        key: ObjectNode
    }): ObjectNode {
        return obj({
            version: str('2017-02-28'),
            operation: str('DeleteItem'),
            key
        })
    }

    /**
     * Create an update item resolver template.
     * @param key
     */
    public static updateItem({ key, condition }: {
        key: ObjectNode,
        condition: ObjectNode
    }) {
        const keyNames = key.attributes.map((attr: [string, Expression]) => attr[0])
        return compoundExpression([
            set(ref('expNames'), obj({})),
            set(ref('expValues'), obj({})),
            set(ref('expSet'), obj({})),
            set(ref('expAdd'), obj({})),
            set(ref('expRemove'), list([])),
            forEach(
                ref('entry'),
                ref(`util.map.copyAndRemoveAllKeys($ctx.args.input, [${keyNames.map(k => `"${k}"`).join(', ')}]).entrySet()`),
                [
                    ifElse(
                        ref('util.isNull($entry.value)'),
                        compoundExpression([
                            set(ref('discard'), ref('expRemove.add("#${entry.key}")')),
                            qref('$expNames.put("#${entry.key}", "${entry.key}")')
                        ]),
                        compoundExpression([
                            qref('$expSet.put("#${entry.key}", ":${entry.key}")'),
                            qref('$expNames.put("#${entry.key}", "${entry.key}")'),
                            qref('$expValues.put(":${entry.key}", $util.dynamodb.toDynamoDB($entry.value))')
                        ])
                    )
                ]
            ),
            set(ref('expression'), str('')),
            iff(raw('!$expSet.isEmpty()'), compoundExpression([
                set(ref('expression'), str('SET')),
                forEach(ref('entry'), ref('expSet.entrySet()'), [
                    set(ref('expression'), str('$expression $entry.key = $entry.value')),
                    iff(ref('foreach.hasNext()'), set(ref('expression'), str('$expression,')))
                ])
            ])),
            iff(raw('!$expAdd.isEmpty()'), compoundExpression([
                set(ref('expression'), str('${expression} ADD')),
                forEach(ref('entry'), ref('expAdd.entrySet()'), [
                    set(ref('expression'), str('$expression $entry.key $entry.value')),
                    iff(ref('foreach.hasNext()'), set(ref('expression'), str('$expression,')))
                ])
            ])),
            iff(raw('!$expRemove.isEmpty()'), compoundExpression([
                set(ref('expression'), str('${expression} REMOVE')),
                forEach(ref('entry'), ref('expRemove'), [
                    set(ref('expression'), str('$expression $entry')),
                    iff(ref('foreach.hasNext()'), set(ref('expression'), str('$expression,')))
                ])
            ])),
            set(ref('update'), obj({})),
            qref('$update.put("expression", "$expression")'),
            iff(
                raw('!${expNames.isEmpty()}'),
                qref('$update.put("expressionNames", $expNames)')
            ),
            iff(
                raw('!${expValues.isEmpty()}'),
                qref('$update.put("expressionValues", $expValues)')
            ),
            obj({
                version: str('2017-02-28'),
                operation: str('UpdateItem'),
                key,
                update: ref('util.toJson($update)'),
                condition
            })
        ])
    }

    public static stringAttributeValue(value: Expression): ObjectNode {
        return {
            kind: 'Object', attributes: [
                ['S', { kind: 'Quotes', expr: value }]
            ]
        };
    }

    public static numericAttributeValue(value: Expression): ObjectNode {
        return {
            kind: 'Object', attributes: [
                ['N', { kind: 'Quotes', expr: value }]
            ]
        };
    }

    public static binaryAttributeValue(value: Expression): ObjectNode {
        return {
            kind: 'Object', attributes: [
                ['B', { kind: 'Quotes', expr: value }]
            ]
        };
    }
}
