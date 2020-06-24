import { Args } from '../args';
import {
  Operator,
  LogicalOperator,
} from '../operator';
import { indenter, Projection } from './common';
import { Param } from '../param';

export type Filter = Operator | LogicalOperator;

export interface EdgeArgs {
  edges: Projection<Edge>;
  type?: string;
  args?: Args;
  filter?: Filter;
}

export class Edge {
  protected type?: string;
  protected edges: Projection<Edge>;
  protected _params: Param[];
  protected args: Args;
  protected filter?: Filter;

  constructor(args: EdgeArgs) {
    Object.assign(this, args);
    this.args = this.args || new Args();
    this._params = this.params();
  }

  params(): Param[] {
    const edgeParams: Param[] = Object.values(this.edges)
      .reduce((r, x) => [
        ...r,
        ...(x instanceof Edge ? x.params() : []),
      ], []);

    return [
      ...edgeParams,
      ...this.args.params(),
      ...(this.filter ? this.filter.params() : []),
    ];
  }

  keyToField(key: string) {
    if (['id', 'uid'].includes(key))
      return 'uid';

    if (this.type)
      return `${this.type}.${key}`;
    return key;
  }

  toString(extraDepth = 0): string {
    const rootIndent = indenter(extraDepth);
    const indent = indenter(extraDepth + 1);

    const projectionLines = Object.entries(this.edges)
      .filter(([_, val]) => !!val)
      .map(([key, val]) => {
        if (typeof val === 'string')
          return `${key}: ${val}`;

        const field = this.keyToField(key);
        const keyToFieldStr = `${key}: ${field}`;
        if (['boolean', 'number'].includes(typeof val))
          return keyToFieldStr;

        return `${keyToFieldStr} ${val.toString(extraDepth + 1).trim()}`;
      })
      .map(x => indent(x));

    const argsStr = !this.args.length() ? ''
      : `(${this.args.toString()}) `;

    const filterStr = !this.filter ? ''
      : `@filter(${this.filter}) `;

    return [
      rootIndent(`${argsStr}${filterStr}{`.trim()),
      ...projectionLines,
      rootIndent('}'),
    ].join('\n');
  }
}
