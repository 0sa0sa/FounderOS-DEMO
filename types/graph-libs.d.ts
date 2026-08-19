// Ambient types for the two graph-lib packages that ship none of their own,
// scoped to only what components/graph-libs/* actually calls.

declare module 'react-cytoscapejs' {
  import * as React from 'react';
  import type { Core, ElementDefinition, LayoutOptions, Stylesheet } from 'cytoscape';

  export interface CytoscapeComponentProps {
    elements: ElementDefinition[];
    style?: React.CSSProperties;
    layout?: LayoutOptions;
    stylesheet?: Stylesheet[];
    cy?: (cy: Core) => void;
    className?: string;
  }

  export default class CytoscapeComponent extends React.Component<CytoscapeComponentProps> {}
}

declare module 'react-vis-network-graph' {
  import * as React from 'react';
  import type { Edges, Network, Nodes, Options } from 'vis-network';

  export interface GraphData {
    nodes: Nodes | Record<string, unknown>[];
    edges: Edges | Record<string, unknown>[];
  }

  export interface GraphEvents {
    [event: string]: (params: unknown) => void;
  }

  export interface GraphProps {
    graph: GraphData;
    options?: Options;
    events?: GraphEvents;
    getNetwork?: (network: Network) => void;
    style?: React.CSSProperties;
  }

  export default class Graph extends React.Component<GraphProps> {}
}
