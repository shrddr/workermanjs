
export class Route {
  constructor(
    public usedPath: number[],
  ) {}
}

export class Profit {
  constructor(
    public priceDaily: number,
  ) {}
}

export class WorkerProfit extends Profit {
  constructor(
    priceDaily: number,
    public dist: number,
    public cycleValue: number,
    public cyclesDaily: number,
  ) {
    super(priceDaily)
  }
}

export class MapJob {
  constructor(
    public route: Route,
    public profit: Profit,
  ) {}

  get displayName() {
    return `MapJob` 
  }
}

export class MapJobGrind extends MapJob {
  constructor(
    route: Route,
    profit: Profit,
    public nk: number,
  ) {
    super(route, profit)
  }

  get displayName() {
    return `MapJob Grind ${this.nk}` 
  }
}

export class MapJobPlantzone extends MapJob {
  constructor(
    route: Route,
    public profit: WorkerProfit,
    public pzk: number,
    public worker: any,
  ) {
    super(route, profit)
  }

  get displayName() {
    return `MapJob Plantzone ${this.pzk}` 
  }
}

export class MapJobWorkshop extends MapJob {
  constructor(
    route: Route,
    public profit: WorkerProfit,
    public hk: number,
    public worker: any,
    public thriftyWorks: number,
    public thriftyPercent: number,
  ) {
    super(route, profit)
  }

  get displayName() {
    return `MapJob Workshop ${this.hk}` 
  }
}

export class MapJobWagon extends MapJob {
  constructor(
    route: Route,
    public profit: Profit,
    public nk_orig: number,
    public nk_dest: number,
  ) {
    super(route, profit)
  }

  get displayName() {
    return `MapJob Wagon ${this.nk_orig} ${this.nk_dest}` 
  }
}