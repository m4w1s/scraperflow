<div align="center">
    <h1>scraperflow</h1>
    <p>Node.js library for concurrent scraping</p>
    <a href="https://www.npmjs.com/package/scraperflow" target="_blank"><img src="https://img.shields.io/npm/v/scraperflow" alt="NPM Version" /></a>
    <a href="https://www.npmjs.com/package/scraperflow" target="_blank"><img src="https://img.shields.io/npm/l/scraperflow" alt="Package License" /></a>
    <a href="https://www.npmjs.com/package/scraperflow" target="_blank"><img src="https://img.shields.io/npm/dt/scraperflow" alt="NPM Downloads" /></a>
</div>

## Features

- Module agnostic. You can use any package like `node-fetch`, `axios` or `got` for requests.
- Rich customization options.
- Handle different pagination types:
  - `None` - Single page. No pagination required.
  - `TotalPages` - The response contains information about the last page.
  - `HasMore` - The total number of pages cannot be pre-calculated.
  - `Cursor` - A cursor from the previous page is needed to fetch the next page.
  - `List` - Predefined list of links or other request options.
- Fully typed.
- Zero dependencies.

## Install

> Note that this package is ESM-only and requires at least Node.js 16.0.0.

#### Using npm:

```shell
npm install scraperflow
```

#### Using yarn:

```shell
yarn add scraperflow
```

## Usage

A quick example of using this package to find all npm packages containing "pagination api".

```js
import got from 'got';
import { ScraperFlow, PaginationType } from 'scraperflow';

const QUERY = 'pagination api';
const PER_PAGE = 20;

const scraper = ScraperFlow.create({
  paginationType: PaginationType.TotalPages,
  paginationStart: 0,
  concurrency: 3,
  // Initiating a global "this" context
  initThisContext: () => {
    return {
      got: got.extend({
        timeout: {
          request: 15000,
        },
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-Spiferack': '1',
        },
      }),
      packages: [],
    };
  },
  // The function where we make the request
  fetchHandler: async function (_ctx, page) {
    const response = await this.got({
      url: 'https://www.npmjs.com/search',
      searchParams: {
        q: QUERY,
        page: page,
        perPage: PER_PAGE,
      },
      responseType: 'json',
      resolveBodyOnly: true,
    });

    return response;
  },
  // Here we resolve the total number of pages
  resolveTotalPages: (_ctx, response) => {
    return Math.ceil(response.total / PER_PAGE);
  },
  // And finally, here we extract the payload
  responseHandler: function (_ctx, response) {
    for (const obj of response.objects) {
      this.packages.push(obj.package);
    }
  },
});

scraper.startOnce().then(() => {
  console.log('packages:', scraper.globalContext.packages);
});
```

## API

## Class: ScraperFlow

Control the scraping process.

### ScraperFlow.create(options)

Create a new `ScraperFlow` instance.

- `options` [ScraperFlowOptions](#interface-scraperflowoptions)

### Properties:

#### options

Validated options.

#### isRunning

The current running status.

#### globalContext

Reference to the global "this" context initiated by `initThisContext`.

#### flowsContexts

Reference to the list of flows contexts initiated by `initFlowContext`.

### Methods:

#### start()

- Returns: `true` if started successfully, `false` if already running

Start the scraper.

#### startOnce()

- Returns: `Promise<void>` A promise that resolves when the cycle ends

Start the scraper just for one cycle.

#### stop([forced])

- `forced` If `true` will stop immediately, otherwise will wait for the current cycle to end
- Returns: `Promise<void>` A promise that resolves when finally stopped

Stop the scraper.

### Events:

#### started

Emitted when the scraper starts.

#### stopped

Emitted when the scraper stops.

#### cycleSummary

- `summary` [CycleSummary](#interface-cyclesummary)

Emitted at the end of each cycle.

#### validationWarning

- `key` The option key
- `msg` A warning message

Emitted when validation of optional parameters fails. In this case, the default value will be used.

#### generalError

- `err` An error object

Emitted when a general error occurred, most likely because of a bad configuration.

In some cases, execution may be stopped due to this type of error. This can be checked by accessing `isRunning` property.

#### fetchError

- `err` An error object
- `args` List of arguments passed to `fetchHandler`

Emitted when an error occurs inside `fetchHandler`.

#### resolveError

- `err` An error object

Emitted when an error occurs inside `resolveTotalPages`, `resolveHasMore`, `resolveCursor` or `resolveList`.

#### responseHandleError

- `err` An error object

Emitted when an error occurs inside `responseHandler`.

#### summaryHandleError

- `err` An error object

Emitted when an error occurs inside `summaryHandler`.

## Enum: PaginationType

- `None` Single page. No pagination required.
- `TotalPages` The response contains information about the last page.
- `HasMore` The total number of pages cannot be pre-calculated.
- `Cursor` A cursor from the previous page is needed to fetch the next page.
- `List` Predefined list of links or other request options.

## Interface: ScraperFlowOptions

### For `PaginationType.None` extends [CommonOptions](#interface-commonoptions)

#### `paginationType`

- Type: `PaginationType.None`

Single page. No pagination required.

#### `fetchHandler`

- Type: `(ctx: TFlowContext) => TResponse | Promise<TResponse>`

Scraping function.

### For `PaginationType.TotalPages` extends [CommonOptions](#interface-commonoptions), [ConcurrencyOptions](#interface-concurrencyoptions)

#### `paginationType`

- Type: `PaginationType.TotalPages`

The response contains information about the last page.

#### `fetchHandler`

- Type: `(ctx: TFlowContext, page: number) => TResponse | Promise<TResponse>`

Scraping function.

#### `resolveTotalPages`

- Type: `(ctx: TFlowContext, response: TResponse) => number | Promise<number>`

Determine the total number of pages.

#### `paginationStart`

- Type: `number`
- Default: `1`

Number pagination begin with.

#### `paginationPrefetch`

- Type: `boolean`
- Default: `false`

To start fetching ahead, before finding out the total number of pages.

### For `PaginationType.HasMore` extends [CommonOptions](#interface-commonoptions), [ConcurrencyOptions](#interface-concurrencyoptions)

#### `paginationType`

- Type: `PaginationType.HasMore`

The total number of pages cannot be pre-calculated.

#### `fetchHandler`

- Type: `(ctx: TFlowContext, page: number) => TResponse | Promise<TResponse>`

Scraping function.

#### `resolveHasMore`

- Type: `(ctx: TFlowContext, response: TResponse) => boolean | Promise<boolean>`

Determine if there is at least one more page.

#### `paginationStart`

- Type: `number`
- Default: `1`

Number pagination begin with.

### For `PaginationType.Cursor` extends [CommonOptions](#interface-commonoptions)

#### `paginationType`

- Type: `PaginationType.Cursor`

A cursor from the previous page is needed to fetch the next page.

Because of that, concurrency options are not available for this method.

#### `fetchHandler`

- Type: `(ctx: TFlowContext, cursor?: TCursor) => TResponse | Promise<TResponse>`

Scraping function.

#### `resolveCursor`

- Type: `(ctx: TFlowContext, response: TResponse) => TCursor | Promise<TCursor | null | undefined> | null | undefined`

Resolve cursor for the next page.

A nullish cursor should be returned for the last page.

### For `PaginationType.List` extends [CommonOptions](#interface-commonoptions), [ConcurrencyOptions](#interface-concurrencyoptions)

#### `paginationType`

- Type: `PaginationType.List`

Predefined list of links or other request options.

#### `fetchHandler`

- Type: `(ctx: TFlowContext, item: TPageListItem) => TResponse | Promise<TResponse>`

Scraping function.

#### `resolveList`

- Type: `() => TPageListItem[] | Promise<TPageListItem[]>`

Determine the list of links or other request options.

Will be called before each cycle.

## Interface: CommonOptions

#### `interval`

- Type: `number | [number, number] | (ctx?: TFlowContext) => number`
- Default: `[1000, 2000]`

Interval between flow executions.

Can be defined as a static number, number interval or function.

#### `intervalStrategy`

- Type: `'dynamic' | 'fixed'`
- Default: `'dynamic'`

Interval strategy for flows.

`dynamic`:
Interval is counted from the <b>start</b> of the previous execution.
If execution takes longer than the interval, the next execution will be delayed until the previous one has finished.

For example if interval is `1000ms` and execution takes `750ms`, the next execution will start after `250ms`.

`fixed`:
Interval is counted from the <b>end</b> of the previous execution.
In this case the interval is fixed and execution time does not affect it.

#### `cycleInterval`

- Type: `number | [number, number] | () => number`
- Default: `undefined`

Interval between scraping cycles. Fallback to `interval` if not defined.

Can be defined as a static number, number interval or function.

#### `cycleIntervalStrategy`

- Type: `'dynamic' | 'fixed'`
- Default: `'fixed'`

Interval strategy for cycles.

Same as `intervalStrategy`, but for cycles.

#### `initThisContext`

- Type: `(oldCtx?: TThisContext) => TThisContext`
- Default: `undefined`

Initialize global "this" context object.

<b>If the function throws, execution will be stopped!</b>

#### `resetThisContext`

- Type: `boolean`
- Default: `false`

Reset global "this" context at the start of each cycle.

#### `initFlowContext`

- Type: `(oldCtx?: TFlowContext) => TFlowContext | TFlowContext[]`
- Default: `undefined`

Initialize flow context object.

If an array is returned, then the concurrency will be equal to the length of the array, ignoring the `concurrency` option.
For pagination type where `concurrency` option is not available, only one context at a time will be used.

<b>If the function throws or returns an empty array, execution will be stopped!</b>

#### `resetFlowContext`

- Type: `boolean`
- Default: `false`

Reset flows contexts at the start of each cycle.

#### `responseHandler`

- Type: `(ctx: TFlowContext, response: TResponse) => void | Promise<void>`
- Default: `undefined`

Response handling.

Can and should be used to handle responses, without worrying about errors that might abort the cycle.

#### `summaryHandler`

- Type: `(summary: CycleSummary) => void | Promise<void>` [CycleSummary](#interface-cyclesummary)
- Default: `undefined`

Cycle summary. Called at the end of each cycle.

#### `errorHandlingPolicy`

Error Handling Policy.

#### `errorHandlingPolicy.retryLimit`

- Type: `number`
- Default: `2`

Extra attempts to fetch the page.

This does not include the first attempt. Set `0` to disable retries.

#### `errorHandlingPolicy.retryDistinctFlows`

- Type: `boolean`
- Default: `true`

Try to fetch the failed page through different contexts.

#### `errorHandlingPolicy.skipPageIfPossible`

- Type: `boolean`
- Default: `false`

Skip the failed page if possible, after reaching the retry limit.

If set to `true`, it is recommended to use `maxTotalPageFails` and/or `maxConsecutivePageFails` options.

This option will not be valid for "cursor" pagination type.

#### `errorHandlingPolicy.maxTotalPageFails`

- Type: `number`
- Default: `Infinity`

Max total failed pages to end the cycle.

A value equal to or less than `0` will end the cycle immediately after the first failed page.

#### `errorHandlingPolicy.maxConsecutivePageFails`

- Type: `number`
- Default: `Infinity`

Max consecutive failed pages to end the cycle.

A value equal to or less than `0` will end the cycle immediately after the first failed page.

#### `logger`

- Type: `boolean | ('validationWarning' | 'generalError' | 'fetchError' | 'resolveError' | 'responseHandleError' | 'summaryHandleError')[]`
- Default: `['validationWarning', 'generalError']`

What type of logs will be printed to console.

Set to `true` to enable all logs, or `false` to disable them.

## Interface: ConcurrencyOptions

#### `concurrency`

- Type: `number`
- Default: `1`

Number of parallel flows for scraping.

Can be changed later to dynamically regulate the concurrency.

#### `removeContextForRedundantFlows`

- Type: `boolean`
- Default: `true`

To remove the context of redundant flows at the start of each cycle.

Used to regulate flow context lifecycle in case of dynamic concurrency.

## Interface: CycleSummary

- `completed` (`boolean`) If cycle was completed or aborted.
- `stats` Cycle stats.
  - `totalPageCount` (`number`) Total number of handled pages.
  - `failedPageList` (`number[]`) List of failed pages.
  - `totalErrorCount` (`number`) Total number of errors thrown by fetch or resolve handlers.
  - `timings` Information about the execution time.
    - `startedAt` (`number`) Unix timestamp for the start of this cycle, in `ms`.
    - `total` (`number`) Total execution time, in `ms`.
    - `avg` Information about the average page handling time.
      - `all` (`number`) Average handling time for both successful and failed pages, in `ms`.
      - `successful` (`number`) Average handling time for successful pages, in `ms`.
      - `failed` (`number`) Average handling time for failed pages, in `ms`.
