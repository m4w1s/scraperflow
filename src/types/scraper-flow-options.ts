import type { PaginationType } from '../enums/pagination.js';

export type IntervalStrategy = 'dynamic' | 'fixed';
export type LogType =
  | 'validationWarning'
  | 'generalError'
  | 'fetchError'
  | 'resolveError'
  | 'responseHandleError'
  | 'summaryHandleError';

export interface CycleSummary {
  /**
   * If cycle was completed or aborted.
   */
  readonly completed: boolean;
  /**
   * Cycle stats.
   */
  readonly stats: {
    /**
     * Total number of handled pages.
     */
    readonly totalPageCount: number;
    /**
     * List of failed pages.
     */
    readonly failedPageList: number[];
    /**
     * Total number of errors thrown by fetch or resolve handlers.
     */
    readonly totalErrorCount: number;
    /**
     * Information about the execution time.
     */
    readonly timings: {
      /**
       * Unix timestamp for the start of this cycle, in `ms`.
       */
      readonly startedAt: number;
      /**
       * Total execution time, in `ms`.
       */
      readonly total: number;
      /**
       * Information about the average page handling time.
       */
      readonly avg: {
        /**
         * Average handling time for both successful and failed pages, in `ms`.
         */
        readonly all: number;
        /**
         * Average handling time for successful pages, in `ms`.
         */
        readonly successful: number;
        /**
         * Average handling time for failed pages, in `ms`.
         */
        readonly failed: number;
      };
    };
  };
}

interface CommonOptions<TThisContext, TFlowContext, TResponse> {
  /**
   * Interval between flow executions. Default `[1000, 2000]`.
   *
   * Can be defined as a static number, number interval or function.
   */
  interval?: number | [number, number] | ((this: TThisContext, ctx?: TFlowContext) => number);
  /**
   * Interval strategy for flows. Default `'dynamic'`.
   *
   * #### `dynamic`:
   * Interval is counted from the <b>start</b> of the previous execution.
   * If execution takes longer than the interval, the next execution will be delayed until the previous one has finished.
   *
   * For example if interval is `1000ms` and execution takes `750ms`, the next execution will start after `250ms`.
   *
   * #### `fixed`:
   * Interval is counted from the <b>end</b> of the previous execution.
   * In this case the interval is fixed and execution time does not affect it.
   */
  intervalStrategy?: IntervalStrategy;
  /**
   * Interval between scraping cycles. Fallback to `interval` if not defined.
   *
   * Can be defined as a static number, number interval or function.
   */
  cycleInterval?: number | [number, number] | ((this: TThisContext) => number);
  /**
   * Interval strategy for cycles. Default `'fixed'`.
   *
   * Same as `intervalStrategy`, but for cycles.
   */
  cycleIntervalStrategy?: IntervalStrategy;
  /**
   * Initialize global "this" context object.
   *
   * @IMPORTANT <b>If the function throws, execution will be stopped!</b>
   */
  initThisContext?: <T extends Record<string, unknown>>(
    this: T | undefined,
    oldCtx?: T,
  ) => TThisContext;
  /**
   * Reset global "this" context at the start of each cycle. Default `false`.
   */
  resetThisContext?: boolean;
  /**
   * Initialize flow context object.
   *
   * If an array is returned, then the concurrency will be equal to the length of the array, ignoring the `concurrency` option.
   * For pagination type where `concurrency` option is not available, only one context at a time will be used.
   *
   * @IMPORTANT <b>If the function throws or returns an empty array, execution will be stopped!</b>
   */
  initFlowContext?: <T extends Record<string, unknown>>(
    this: TThisContext,
    oldCtx?: T,
  ) => TFlowContext | TFlowContext[];
  /**
   * Reset flows contexts at the start of each cycle. Default `false`.
   */
  resetFlowContext?: boolean;
  /**
   * Response handling.
   *
   * Can and should be used to handle responses, without worrying about errors that might abort the cycle.
   */
  responseHandler?: (
    this: TThisContext,
    ctx: TFlowContext,
    response: TResponse,
  ) => void | Promise<void>;
  /**
   * Cycle summary. Called at the end of each cycle.
   */
  summaryHandler?: (this: TThisContext, summary: CycleSummary) => void | Promise<void>;
  /**
   * Error Handling Policy.
   */
  errorHandlingPolicy?: {
    /**
     * Extra attempts to fetch the page. Default `2`.
     *
     * This does not include the first attempt. Set `0` to disable retries.
     */
    retryLimit?: number;
    /**
     * Try to fetch the failed page through different contexts. Default `true`.
     */
    retryDistinctFlows?: boolean;
    /**
     * Skip the failed page if possible, after reaching the retry limit. Default `false`.
     *
     * If set to `true`, it is recommended to use `maxTotalPageFails` and/or `maxConsecutivePageFails` options.
     *
     * @NOTE This option will not be valid for "cursor" pagination type.
     */
    skipPageIfPossible?: boolean;
    /**
     * Max total failed pages to end the cycle. Default `Infinity`.
     *
     * A value equal to or less than `0` will end the cycle immediately after the first failed page.
     */
    maxTotalPageFails?: number;
    /**
     * Max consecutive failed pages to end the cycle. Default `Infinity`.
     *
     * A value equal to or less than `0` will end the cycle immediately after the first failed page.
     */
    maxConsecutivePageFails?: number;
  };
  /**
   * What type of logs will be printed to console. Default `['validationWarning', 'generalError']`.
   *
   * Set to `true` to enable all logs, or `false` to disable them.
   */
  logger?: boolean | LogType[];
}

interface ConcurrencyOptions {
  /**
   * Number of parallel flows for scraping. Default and minimum `1`.
   *
   * Can be changed later to dynamically regulate the concurrency.
   */
  concurrency?: number;
  /**
   * To remove the context of redundant flows at the start of each cycle. Default `true`.
   *
   * Used to regulate flow context lifecycle in case of dynamic concurrency.
   */
  removeContextForRedundantFlows?: boolean;
}

interface TotalPagesAndHasMoreCommonOptions<TThisContext, TFlowContext, TResponse> {
  /**
   * Scraping function.
   */
  fetchHandler: (
    this: TThisContext,
    ctx: TFlowContext,
    page: number,
  ) => TResponse | Promise<TResponse>;
  /**
   * Number pagination begin with. Default `1`.
   */
  paginationStart?: number;
}

interface PaginationForNone<TThisContext, TFlowContext, TResponse>
  extends CommonOptions<TThisContext, TFlowContext, TResponse> {
  /**
   * Single page. No pagination required.
   */
  paginationType?: PaginationType.None;
  /**
   * Scraping function.
   */
  fetchHandler: (this: TThisContext, ctx: TFlowContext) => TResponse | Promise<TResponse>;
}
export type PaginationForNoneOptions<TThisContext, TFlowContext, TResponse> =
  ThisType<TThisContext> & PaginationForNone<TThisContext, TFlowContext, TResponse>;

interface PaginationForTotalPages<TThisContext, TFlowContext, TResponse>
  extends CommonOptions<TThisContext, TFlowContext, TResponse>,
    ConcurrencyOptions,
    TotalPagesAndHasMoreCommonOptions<TThisContext, TFlowContext, TResponse> {
  /**
   * The response contains information about the last page.
   */
  paginationType: PaginationType.TotalPages;
  /**
   * Determine the total number of pages.
   */
  resolveTotalPages: (
    this: TThisContext,
    ctx: TFlowContext,
    response: TResponse,
  ) => number | Promise<number>;
  /**
   * To start fetching ahead, before finding out the total number of pages. Default `false`.
   */
  paginationPrefetch?: boolean;
}
export type PaginationForTotalPagesOptions<TThisContext, TFlowContext, TResponse> =
  ThisType<TThisContext> & PaginationForTotalPages<TThisContext, TFlowContext, TResponse>;

interface PaginationForHasMore<TThisContext, TFlowContext, TResponse>
  extends CommonOptions<TThisContext, TFlowContext, TResponse>,
    ConcurrencyOptions,
    TotalPagesAndHasMoreCommonOptions<TThisContext, TFlowContext, TResponse> {
  /**
   * The total number of pages cannot be pre-calculated.
   */
  paginationType: PaginationType.HasMore;
  /**
   * Determine if there is at least one more page.
   */
  resolveHasMore: (
    this: TThisContext,
    ctx: TFlowContext,
    response: TResponse,
  ) => boolean | Promise<boolean>;
}
export type PaginationForHasMoreOptions<TThisContext, TFlowContext, TResponse> =
  ThisType<TThisContext> & PaginationForHasMore<TThisContext, TFlowContext, TResponse>;

interface PaginationForCursor<TThisContext, TFlowContext, TResponse, TCursor>
  extends CommonOptions<TThisContext, TFlowContext, TResponse> {
  /**
   * A cursor from the previous page is needed to fetch the next page.
   *
   * Because of that, concurrency options are not available for this method.
   */
  paginationType: PaginationType.Cursor;
  /**
   * Scraping function.
   */
  fetchHandler: (
    this: TThisContext,
    ctx: TFlowContext,
    cursor?: TCursor,
  ) => TResponse | Promise<TResponse>;
  /**
   * Resolve cursor for the next page.
   *
   * A nullish cursor should be returned for the last page.
   */
  resolveCursor: (
    this: TThisContext,
    ctx: TFlowContext,
    response: TResponse,
  ) => TCursor | Promise<TCursor | null | undefined> | null | undefined;
}
export type PaginationForCursorOptions<TThisContext, TFlowContext, TResponse, TCursor> =
  ThisType<TThisContext> & PaginationForCursor<TThisContext, TFlowContext, TResponse, TCursor>;

interface PaginationForList<TThisContext, TFlowContext, TResponse, TPageListItem>
  extends CommonOptions<TThisContext, TFlowContext, TResponse>,
    ConcurrencyOptions {
  /**
   * Predefined list of links or other request options.
   */
  paginationType: PaginationType.List;
  /**
   * Scraping function.
   */
  fetchHandler: (
    this: TThisContext,
    ctx: TFlowContext,
    item: TPageListItem,
  ) => TResponse | Promise<TResponse>;
  /**
   * Determine the list of links or other request options.
   *
   * Will be called before each cycle.
   */
  resolveList: (this: TThisContext) => TPageListItem[] | Promise<TPageListItem[]>;
}
export type PaginationForListOptions<TThisContext, TFlowContext, TResponse, TPageListItem> =
  ThisType<TThisContext> & PaginationForList<TThisContext, TFlowContext, TResponse, TPageListItem>;

export type ScraperFlowOptions<TThisContext, TFlowContext, TResponse, TCursor, TPageListItem> =
  | PaginationForNoneOptions<TThisContext, TFlowContext, TResponse>
  | PaginationForTotalPagesOptions<TThisContext, TFlowContext, TResponse>
  | PaginationForHasMoreOptions<TThisContext, TFlowContext, TResponse>
  | PaginationForCursorOptions<TThisContext, TFlowContext, TResponse, TCursor>
  | PaginationForListOptions<TThisContext, TFlowContext, TResponse, TPageListItem>;
