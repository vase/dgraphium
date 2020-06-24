import clone from 'clone';
import { ArgsBuilder, ArgsBuilderData } from '../args';
import {
  OpValue,
  OpBuilderValue,
  OperatorBuilder,
  LogicalOperatorBuilder,
} from '../operator';
import { ParamBuilder, paramNameGen, ParamNameGen } from '../param';
import { Edge } from './edge';
import { capitalize, RawProjection, Projection } from './common';

type OpBuilders = OperatorBuilder | LogicalOperatorBuilder;

export interface BuildEdgeArgs {
  pNameGen?: ParamNameGen;
}

/** should match EdgeBuilder's constructor */
export interface EdgeBuilderConstructor {
  (edges: EdgeBuilder | RawProjection<EdgeBuilder>): EdgeBuilder;
  (type: string, edges: EdgeBuilder | RawProjection<EdgeBuilder>): EdgeBuilder;
}

export class EdgeBuilder {
  protected type?: string;
  protected edges: Projection<EdgeBuilder>;
  protected args: ArgsBuilder = new ArgsBuilder();
  protected _filter?: OpBuilders;

  constructor(
    type?: string | EdgeBuilder | RawProjection<EdgeBuilder>,
    edges?: EdgeBuilder | RawProjection<EdgeBuilder>
  ) {
    if (type) {
      if (typeof type !== 'string')
        return new EdgeBuilder(undefined, type);
      this.type = capitalize(type);
    }

    if (edges instanceof EdgeBuilder)
      return clone(edges);

    this.setEdges(edges);
  }

  protected setEdges(edges: EdgeBuilder | RawProjection<EdgeBuilder>) {
    this.edges = Object.entries(edges)
      .reduce((r, [k ,v]) => {
        if (typeof v === 'object') r[k] = new EdgeBuilder(k, v);
        else r[k] = v;
        return r;
      }, {});
  }

  withArgs(args: ArgsBuilder | Omit<ArgsBuilderData, 'func'>) {
    if (args instanceof ArgsBuilder)
      this.args = args;
    else
      this.args = new ArgsBuilder(args);
    return this;
  }

  first(val: ArgsBuilderData['first']) {
    this.args.setArg('first', val);
    return this;
  }

  offset(val: ArgsBuilderData['offset']) {
    this.args.setArg('offset', val);
    return this;
  }

  after(val: ArgsBuilderData['after']) {
    this.args.setArg('after', val);
    return this;
  }

  protected buildParam(builder: ParamBuilder, pNameGen: ParamNameGen) {
    return builder.build(pNameGen.next().value);
  }

  protected buildOpValue(
    value: (OpBuilderValue | OpBuilderValue[]),
    pNameGen: ParamNameGen
  ): OpValue | OpValue[] {
    if (Array.isArray(value))
      return value.map(x => this.buildOpValue(x, pNameGen) as OpValue);
    if (value instanceof ParamBuilder)
      return this.buildParam(value, pNameGen);
    return value;
  }

  protected buildOp<
    T extends OpBuilders,
    R extends ReturnType<T['build']>
  >(op: T, pNameGen: ParamNameGen): R {
    if (op instanceof OperatorBuilder) {
      return op.build(args => ({
        ...args,
        value: this.buildOpValue(args.value, pNameGen),
        subject: args.subject ? this.keyToField(args.subject) : undefined,
      })) as R;
    } else if (op instanceof LogicalOperatorBuilder) {
      return op.build(args => ({
        ...args,
        operators: args.operators.map(this.buildOp.bind(this)),
      })) as R;
    }
    throw Error('invalid `op`');
  }

  filter(opBuilder: OpBuilders) {
    this._filter = opBuilder;
    return this;
  }

  keyToField(key: string) {
    if (['id', 'uid'].includes(key))
      return 'uid';

    if (this.type)
      return `${this.type}.${key}`;
    return key;
  }

  paramBuilders(): ParamBuilder[] {
    const edgeParams: ParamBuilder[] = Object.values(this.edges)
      .reduce((r, x) => [
        ...r,
        ...(x instanceof EdgeBuilder ? x.paramBuilders() : []),
      ], []);

    return [
      ...edgeParams,
      ...this.args.paramBuilders(),
      ...(this._filter ? this._filter.paramBuilders() : []),
    ];
  }

  protected buildEdgeArgs(pNameGen = paramNameGen()) {
    const args = this.args.build(argMap => {
      return Object.entries(argMap)
        .reduce((r, [k, v]) => {
          if (v instanceof OperatorBuilder || v instanceof LogicalOperatorBuilder)
            r[k] = this.buildOp(v, pNameGen);
          else
            r[k] = v;
          return r;
        }, {});
    });

    const edges = Object.entries(this.edges)
      .reduce((r, [k, v]) => {
        if (v instanceof EdgeBuilder) r[k] = v.build({ pNameGen });
        else r[k] = v;
        return r;
      }, {});

    return {
      args,
      edges,
      filter: this._filter && this.buildOp(this._filter, pNameGen),
      type: this.type,
    };
  }

  build<
    A extends BuildEdgeArgs
  >(args: Partial<A> = {}) {
    return new Edge(
      this.buildEdgeArgs(args.pNameGen)
    );
  }

  /**
   * build and stringify
   */
  toString(extraDepth?: number) {
    return this.build().toString(extraDepth);
  }
}