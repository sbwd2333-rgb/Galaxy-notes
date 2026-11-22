declare module 'd3-force-3d' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export interface Simulation {
    tick(iterations?: number): Simulation
    stop(): Simulation
    restart(): Simulation
    nodes(): any[]
    force(name: string, value?: any): any
  }
  export function forceSimulation(nodes?: any[], numDimensions?: number): Simulation
  export function forceManyBody(): any
  export function forceLink(links?: any[]): any
  export function forceCenter(x?: number, y?: number, z?: number): any
  export function forceX(x?: number): any
  export function forceY(y?: number): any
  export function forceZ(z?: number): any
  export function forceCollide(radius?: number): any
}
