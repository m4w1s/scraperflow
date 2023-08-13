import { EventEmitter } from 'node:events';
import { PaginationType } from './enums/pagination.js';
import type {
  CycleSummary,
  LogType,
  PaginationForCursorOptions,
  PaginationForHasMoreOptions,
  PaginationForListOptions,
  PaginationForNoneOptions,
  PaginationForTotalPagesOptions,
  ScraperFlowOptions,
} from './types/scraper-flow-options.js';
import type {
  ValidatedScraperFlowOptions,
  ValidatedPaginationForNoneOptions,
  ValidatedPaginationForTotalPagesOptions,
  ValidatedPaginationForHasMoreOptions,
  ValidatedPaginationForCursorOptions,
  ValidatedPaginationForListOptions,
} from './types/validated-options.js';
import { validateOptions } from './utils/validate-options.js';
import { CycleSummaryHelper } from './utils/cycle-summary-helper.js';
import { sleep } from './utils/sleep.js';

export class ScraperFlow<
  TPaginationType extends PaginationType,
  TThisContext extends Record<string, unknown>,
  TFlowContext extends Record<string, unknown>,
  TResponse,
  TCursor,
  TPageListItem,
> extends EventEmitter {
  static create<
    TThisContext extends Record<string, unknown>,
    TFlowContext extends Record<string, unknown>,
    TResponse,
  >(
    options: PaginationForNoneOptions<TThisContext, TFlowContext, TResponse>,
  ): ScraperFlow<PaginationType.None, TThisContext, TFlowContext, TResponse, unknown, unknown>;
  static create<
    TThisContext extends Record<string, unknown>,
    TFlowContext extends Record<string, unknown>,
    TResponse,
  >(
    options: PaginationForTotalPagesOptions<TThisContext, TFlowContext, TResponse>,
  ): ScraperFlow<
    PaginationType.TotalPages,
    TThisContext,
    TFlowContext,
    TResponse,
    unknown,
    unknown
  >;
  static create<
    TThisContext extends Record<string, unknown>,
    TFlowContext extends Record<string, unknown>,
    TResponse,
  >(
    options: PaginationForHasMoreOptions<TThisContext, TFlowContext, TResponse>,
  ): ScraperFlow<PaginationType.HasMore, TThisContext, TFlowContext, TResponse, unknown, unknown>;
  static create<
    TThisContext extends Record<string, unknown>,
    TFlowContext extends Record<string, unknown>,
    TResponse,
    TCursor,
  >(
    options: PaginationForCursorOptions<TThisContext, TFlowContext, TResponse, TCursor>,
  ): ScraperFlow<PaginationType.Cursor, TThisContext, TFlowContext, TResponse, TCursor, unknown>;
  static create<
    TThisContext extends Record<string, unknown>,
    TFlowContext extends Record<string, unknown>,
    TResponse,
    TPageListItem,
  >(
    options: PaginationForListOptions<TThisContext, TFlowContext, TResponse, TPageListItem>,
  ): ScraperFlow<
    PaginationType.List,
    TThisContext,
    TFlowContext,
    TResponse,
    unknown,
    TPageListItem
  >;
  static create<
    TThisContext extends Record<string, unknown>,
    TFlowContext extends Record<string, unknown>,
    TResponse,
    TCursor,
    TPageListItem,
  >(options: ScraperFlowOptions<TThisContext, TFlowContext, TResponse, TCursor, TPageListItem>) {
    return new this(options);
  }

  /**
   * Internal state
   */
  readonly #state: {
    running?: {
      abortController: AbortController;
      promise: Promise<void>;
    };
    globalContext: TThisContext;
    flowsContexts: TFlowContext[];
    isFirstContextInit: boolean;
    /**
     * If concurrency should be fixed to the number of contexts.
     */
    isConcurrencyFixed: boolean;
  };

  /**
   * Validated options.
   */
  readonly options: ValidatedScraperFlowOptions<
    TPaginationType,
    TThisContext,
    TFlowContext,
    TResponse,
    TCursor,
    TPageListItem
  >;

  get isRunning(): boolean {
    return !!this.#state.running;
  }

  /**
   * Global "this" context.
   */
  get globalContext(): TThisContext {
    return this.#state.globalContext;
  }

  /**
   * Flows contexts.
   */
  get flowsContexts(): readonly TFlowContext[] {
    return this.#state.flowsContexts;
  }

  /**
   * Use static method `create` to instantiate a new class instance.
   */
  private constructor(
    options: ScraperFlowOptions<TThisContext, TFlowContext, TResponse, TCursor, TPageListItem>,
  ) {
    super();

    this.options = validateOptions(options, this._log.bind(this, 'validationWarning'));

    const globalContext = this.options.initThisContext.call(undefined);

    if (typeof globalContext !== 'object') {
      throw new TypeError('This context should be an object');
    }

    this.#state = {
      globalContext,
      flowsContexts: [],
      isFirstContextInit: true,
      isConcurrencyFixed: false,
    };
  }

  /**
   * Start the scraper.
   *
   * @returns {} `true` if started successfully, `false` if already running.
   */
  start(): boolean {
    const state = this.#state;

    if (state.running) return false;

    const abortController = new AbortController();
    const promise = this._startCycleLoop(abortController.signal);
    const running = {
      abortController,
      promise,
    };

    // Rewriting the promise to only fulfill after the stop work has been done
    running.promise = running.promise.finally(() => {
      // Need to make sure the object reference remains the same
      if (running !== state.running) return;

      state.running = undefined;

      this._emitNextTick('stopped');
    });

    state.running = running;

    this._emitNextTick('started');

    return true;
  }

  /**
   * Start the scraper just for one cycle.
   *
   * @returns {} A promise that resolves when the cycle ends.
   */
  startOnce(): Promise<void> {
    const started = this.start();

    if (started) {
      // We use graceful stop here, to execute just one cycle
      return this.stop();
    }

    return Promise.resolve();
  }

  /**
   * Stop the scraper.
   *
   * @param forced If `true` will stop immediately, otherwise will wait for the current cycle to end.
   * @returns {} A promise that resolves when finally stopped.
   */
  stop(forced?: boolean): Promise<void> {
    const state = this.#state;

    if (!state.running) return Promise.resolve();

    if (!state.running.abortController.signal.aborted) {
      state.running.abortController.abort(forced ? 'forcedStop' : 'gracefulStop');
    } else if (forced) {
      // Dispatching a custom event to send a new forced stop signal
      const evt = new Event('abort');
      Object.defineProperty(evt, 'forcedStop', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: true,
      });

      state.running.abortController.signal.dispatchEvent(evt);
    }

    return state.running.promise;
  }

  private async _startCycleLoop(signal: AbortSignal): Promise<void> {
    const CYCLE_HANDLERS: Record<PaginationType, (signal: AbortSignal) => Promise<CycleSummary>> = {
      [PaginationType.None]: this._handlePaginationNoneCycle.bind(this),
      [PaginationType.TotalPages]: this._handlePaginationTotalPagesCycle.bind(this),
      [PaginationType.HasMore]: this._handlePaginationHasMoreCycle.bind(this),
      [PaginationType.Cursor]: this._handlePaginationCursorCycle.bind(this),
      [PaginationType.List]: this._handlePaginationListCycle.bind(this),
    };
    const cycleHandler = CYCLE_HANDLERS[this.options.paginationType];
    let currentCycleAbortController: AbortController | undefined;

    signal.addEventListener('abort', onabort);

    while (!signal.aborted) {
      currentCycleAbortController = new AbortController();

      if (this.options.resetThisContext && !this.#state.isFirstContextInit) {
        try {
          const globalContext = this.options.initThisContext.call(
            this.globalContext,
            this.globalContext,
          );

          if (typeof globalContext !== 'object') {
            this._forcedStopOnError(new TypeError('This context should be an object'));

            break;
          }

          this.#state.globalContext = globalContext;
        } catch (e) {
          this._forcedStopOnError(e);

          break;
        }
      }

      if (this._updateFlowsContexts(true)) {
        this.#state.isFirstContextInit = false;
      } else {
        break;
      }

      const startTime = Date.now();
      const summary = await cycleHandler(currentCycleAbortController.signal);

      if (this.options.summaryHandler) {
        try {
          await this.options.summaryHandler.call(this.globalContext, summary);
        } catch (e) {
          this._log('summaryHandleError', e);
        }
      }

      try {
        // Emit sync before any potential context reset
        this.emit('cycleSummary', summary);
      } catch (e) {
        this._log('generalError', e);
      }

      const interval = this._computeInterval('cycleInterval');

      if (this.options.cycleIntervalStrategy === 'dynamic') {
        const dynamicInterval = interval - (Date.now() - startTime);

        if (dynamicInterval > 0) {
          await sleep(dynamicInterval, signal);
        }
      } else if (interval > 0) {
        await sleep(interval, signal);
      }
    }

    signal.removeEventListener('abort', onabort);

    function onabort(evt: Event & { forcedStop?: boolean }): void {
      const forcedStop = evt.forcedStop ?? signal.reason === 'forcedStop';

      if (forcedStop && currentCycleAbortController) {
        currentCycleAbortController.abort();
      }
    }
  }

  private async _handlePaginationNoneCycle(signal: AbortSignal): Promise<CycleSummary> {
    if (this.options.paginationType !== PaginationType.None) {
      throw new Error(
        `Incorrect pagination type "${this.options.paginationType}" for this handler "${PaginationType.None}"`,
      );
    }

    const options = this.options as ValidatedPaginationForNoneOptions<
      TThisContext,
      TFlowContext,
      TResponse
    >;
    const summaryHelper = new CycleSummaryHelper();

    summaryHelper.stats.totalPageCount = 1;

    await this._startFlowOrchestrator(async (ctx, attemptsLeft, done) => {
      const startTime = Date.now();

      done(); // We have only one page to fetch

      try {
        const response = await options.fetchHandler.call(this.globalContext, ctx);
        this._handleResponse(ctx, response);

        summaryHelper.completed = true;
        summaryHelper.addAvgTiming('successful', Date.now() - startTime);

        return false;
      } catch (e) {
        this._log('fetchError', e, [ctx]);

        summaryHelper.stats.totalErrorCount++;
        summaryHelper.addAvgTiming('failed', Date.now() - startTime);

        if (attemptsLeft <= 0) {
          summaryHelper.stats.failedPageList.add(1);
        }

        return true;
      } finally {
        summaryHelper.addAvgTiming('all', Date.now() - startTime);
      }
    }, signal);

    return summaryHelper.summarize();
  }

  private async _handlePaginationTotalPagesCycle(signal: AbortSignal): Promise<CycleSummary> {
    if (this.options.paginationType !== PaginationType.TotalPages) {
      throw new Error(
        `Incorrect pagination type "${this.options.paginationType}" for this handler "${PaginationType.TotalPages}"`,
      );
    }

    const options = this.options as ValidatedPaginationForTotalPagesOptions<
      TThisContext,
      TFlowContext,
      TResponse
    >;
    const summaryHelper = new CycleSummaryHelper();
    const failCounter = this._initFailCounter();
    let nextPage = options.paginationStart;
    let lastPage: number | undefined;

    await this._startFlowOrchestrator(async (ctx, attemptsLeft, done, retry?: { page: number }) => {
      const startTime = Date.now();

      let page: number;

      if (retry) {
        page = retry.page;
      } else {
        page = nextPage++;

        if (typeof lastPage !== 'undefined' && page >= lastPage) {
          done();

          summaryHelper.completed = true;
        }
      }

      let successful = false;

      try {
        const response = await options.fetchHandler.call(this.globalContext, ctx, page);

        try {
          const totalPages = await options.resolveTotalPages.call(
            this.globalContext,
            ctx,
            response,
          );

          if (Number.isFinite(totalPages)) {
            successful = true;

            lastPage = totalPages;
            summaryHelper.stats.totalPageCount = totalPages;
          } else {
            this._log('resolveError', new Error(`Invalid value returned "${totalPages}"`));
          }
        } catch (e) {
          this._log('resolveError', e);
        } finally {
          this._handleResponse(ctx, response);
        }
      } catch (e) {
        this._log('fetchError', e, [ctx, page]);
      }

      summaryHelper.addAvgTiming('all', Date.now() - startTime);

      if (successful) {
        summaryHelper.addAvgTiming('successful', Date.now() - startTime);

        failCounter.success();
      } else {
        summaryHelper.stats.totalErrorCount++;
        summaryHelper.addAvgTiming('failed', Date.now() - startTime);

        if (attemptsLeft <= 0) {
          summaryHelper.stats.failedPageList.add(page);

          if (failCounter.fail(page)) {
            done();
          }
        }
      }

      return successful ? false : { page };
    }, signal);

    summaryHelper.completed = summaryHelper.completed && failCounter.complete(lastPage);

    return summaryHelper.summarize();
  }

  private async _handlePaginationHasMoreCycle(signal: AbortSignal): Promise<CycleSummary> {
    if (this.options.paginationType !== PaginationType.HasMore) {
      throw new Error(
        `Incorrect pagination type "${this.options.paginationType}" for this handler "${PaginationType.HasMore}"`,
      );
    }

    const options = this.options as ValidatedPaginationForHasMoreOptions<
      TThisContext,
      TFlowContext,
      TResponse
    >;
    const summaryHelper = new CycleSummaryHelper();
    const failCounter = this._initFailCounter();
    let nextPage = options.paginationStart;
    let lastPage: number | undefined;

    await this._startFlowOrchestrator(async (ctx, attemptsLeft, done, retry?: { page: number }) => {
      const startTime = Date.now();

      let page: number;

      if (retry) {
        page = retry.page;

        if (typeof lastPage !== 'undefined' && page > lastPage) {
          return false;
        }
      } else {
        page = nextPage++;
      }

      let successful = false;

      try {
        const response = await options.fetchHandler.call(this.globalContext, ctx, page);

        try {
          const hasMore = await options.resolveHasMore.call(this.globalContext, ctx, response);

          successful = true;

          if (!hasMore) {
            done();

            summaryHelper.completed = true;

            if (typeof lastPage === 'undefined' || page < lastPage) {
              lastPage = page;
              summaryHelper.stats.totalPageCount = page;
            }
          }
        } catch (e) {
          this._log('resolveError', e);
        } finally {
          this._handleResponse(ctx, response);
        }
      } catch (e) {
        this._log('fetchError', e, [ctx, page]);
      }

      summaryHelper.addAvgTiming('all', Date.now() - startTime);

      if (successful) {
        summaryHelper.addAvgTiming('successful', Date.now() - startTime);

        failCounter.success();
      } else {
        summaryHelper.stats.totalErrorCount++;
        summaryHelper.addAvgTiming('failed', Date.now() - startTime);

        if (attemptsLeft <= 0) {
          summaryHelper.stats.failedPageList.add(page);

          if (failCounter.fail(page)) {
            done();
          }
        }
      }

      return successful ? false : { page };
    }, signal);

    summaryHelper.completed = summaryHelper.completed && failCounter.complete(lastPage);

    return summaryHelper.summarize();
  }

  private async _handlePaginationCursorCycle(signal: AbortSignal): Promise<CycleSummary> {
    if (this.options.paginationType !== PaginationType.Cursor) {
      throw new Error(
        `Incorrect pagination type "${this.options.paginationType}" for this handler "${PaginationType.Cursor}"`,
      );
    }

    const options = this.options as ValidatedPaginationForCursorOptions<
      TThisContext,
      TFlowContext,
      TResponse,
      TCursor
    >;
    const summaryHelper = new CycleSummaryHelper();
    let nextPageCursor: TCursor | undefined;
    let nextPageNum = 1;

    await this._startFlowOrchestrator(
      async (ctx, attemptsLeft, done, retry?: { cursor?: TCursor; pageNum: number }) => {
        const startTime = Date.now();

        let cursor: TCursor | undefined;
        let pageNum: number;

        if (retry) {
          cursor = retry.cursor;
          pageNum = retry.pageNum;
        } else {
          cursor = nextPageCursor;
          pageNum = nextPageNum++;
        }

        let successful = false;

        try {
          const response = await options.fetchHandler.call(this.globalContext, ctx, cursor);

          try {
            const resolvedCursor = await options.resolveCursor.call(
              this.globalContext,
              ctx,
              response,
            );

            successful = true;

            if (resolvedCursor != null) {
              nextPageCursor = resolvedCursor;
            } else {
              done();

              summaryHelper.completed = true;
            }
          } catch (e) {
            this._log('resolveError', e);
          } finally {
            this._handleResponse(ctx, response);
          }
        } catch (e) {
          this._log('fetchError', e, [ctx, cursor]);
        }

        summaryHelper.addAvgTiming('all', Date.now() - startTime);

        if (successful) {
          summaryHelper.addAvgTiming('successful', Date.now() - startTime);
        } else {
          summaryHelper.stats.totalErrorCount++;
          summaryHelper.addAvgTiming('failed', Date.now() - startTime);

          if (attemptsLeft <= 0) {
            done();

            summaryHelper.stats.failedPageList.add(pageNum);
          }
        }

        return successful ? false : { cursor, pageNum };
      },
      signal,
    );

    summaryHelper.stats.totalPageCount = nextPageNum - 1;

    return summaryHelper.summarize();
  }

  private async _handlePaginationListCycle(signal: AbortSignal): Promise<CycleSummary> {
    if (this.options.paginationType !== PaginationType.List) {
      throw new Error(
        `Incorrect pagination type "${this.options.paginationType}" for this handler "${PaginationType.List}"`,
      );
    }

    const options = this.options as ValidatedPaginationForListOptions<
      TThisContext,
      TFlowContext,
      TResponse,
      TPageListItem
    >;
    const summaryHelper = new CycleSummaryHelper();
    const failCounter = this._initFailCounter();
    let pageListItems: TPageListItem[];
    let nextPageIndex = 0;

    try {
      pageListItems = await options.resolveList.call(this.globalContext);

      if (!Array.isArray(pageListItems) || !pageListItems.length) {
        this._log('resolveError', new Error('Page list is not an array or is empty'));

        return summaryHelper.summarize();
      }
    } catch (e) {
      this._log('resolveError', e);

      return summaryHelper.summarize();
    }

    await this._startFlowOrchestrator(
      async (ctx, attemptsLeft, done, retry?: { item: TPageListItem; index: number }) => {
        const startTime = Date.now();

        let item: TPageListItem;
        let index: number;

        if (retry) {
          item = retry.item;
          index = retry.index;
        } else {
          index = nextPageIndex++;
          item = pageListItems[index] as TPageListItem; // Below we check existence by index and length

          if (nextPageIndex >= pageListItems.length) {
            done();

            summaryHelper.completed = true;
          }
          if (index >= pageListItems.length) {
            return false;
          }
        }

        try {
          const response = await options.fetchHandler.call(this.globalContext, ctx, item);
          this._handleResponse(ctx, response);

          summaryHelper.addAvgTiming('successful', Date.now() - startTime);

          failCounter.success();

          return false;
        } catch (e) {
          this._log('fetchError', e, [ctx, item]);

          summaryHelper.stats.totalErrorCount++;
          summaryHelper.addAvgTiming('failed', Date.now() - startTime);

          if (attemptsLeft <= 0) {
            summaryHelper.stats.failedPageList.add(index);

            if (failCounter.fail()) {
              done();
            }
          }

          return { item, index };
        } finally {
          summaryHelper.addAvgTiming('all', Date.now() - startTime);
        }
      },
      signal,
    );

    summaryHelper.stats.totalPageCount = nextPageIndex;
    summaryHelper.completed = summaryHelper.completed && failCounter.complete();

    return summaryHelper.summarize();
  }

  private _startFlowOrchestrator<TRetry extends Record<string, unknown> | true>(
    executor: (
      ctx: TFlowContext,
      attemptsLeft: number,
      done: () => void,
      retry?: TRetry,
    ) => Promise<TRetry | false>,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        return resolve();
      }

      signal.addEventListener('abort', finish, { once: true });

      const state = this.#state;
      const flows = new Set<TFlowContext>();
      const pendingRetries: {
        retry?: TRetry;
        flows: Set<TFlowContext>;
        attemptsLeft: number;
      }[] = [];
      const flowsLastExecution = new Map<TFlowContext, { time: number }>();
      let firstPageReady = false;
      let executorDone = false;
      let resolved = false;

      const handleFlowExecution = async (
        ctx: TFlowContext,
        pendingRetry?: (typeof pendingRetries)[number],
      ): Promise<void> => {
        const lastExecution = flowsLastExecution.get(ctx);

        if (lastExecution) {
          const elapsedTime = Date.now() - lastExecution.time;

          const interval = this._computeInterval('interval', ctx);
          let canceled = false;

          if (this.options.intervalStrategy === 'dynamic') {
            const dynamicInterval = interval - elapsedTime;

            if (dynamicInterval > 0) {
              canceled = await sleep(dynamicInterval, signal);
            }
          } else if (interval > 0) {
            canceled = await sleep(interval, signal);
          }

          lastExecution.time = Date.now();

          if (canceled || (executorDone && !pendingRetry)) {
            flows.delete(ctx);
            process.nextTick(startFlows);

            return;
          }
        } else {
          flowsLastExecution.set(ctx, {
            time: Date.now(),
          });
        }

        const attemptsLeft = pendingRetry
          ? pendingRetry.attemptsLeft
          : this.options.errorHandlingPolicy.retryLimit;

        // We assume that executor does not throw/reject
        const retry = await executor(ctx, attemptsLeft, done, pendingRetry?.retry);

        if (!retry) {
          firstPageReady = true;
        } else if (attemptsLeft > 0) {
          if (pendingRetry) {
            pendingRetry.retry = retry;
            pendingRetry.attemptsLeft = attemptsLeft - 1;
          } else {
            pendingRetry = {
              retry,
              flows: new Set(),
              attemptsLeft: attemptsLeft - 1,
            };
          }

          pendingRetry.flows.add(ctx);
          pendingRetries.push(pendingRetry);
        }

        flows.delete(ctx);
        process.nextTick(startFlows);
      };

      const startFlows = (): void => {
        if (resolved) return;

        if (executorDone && !flows.size && !pendingRetries.length) {
          return finish();
        }

        if (!this._updateFlowsContexts()) {
          return; // An abort signal has been sent, which should end the execution
        }

        let { concurrency, concurrencySupported } = this._getConcurrencyOptions();

        if (
          this.options.paginationType === PaginationType.TotalPages &&
          !this.options.paginationPrefetch &&
          !firstPageReady
        ) {
          concurrency = 1;
        } else if (concurrencySupported && state.isConcurrencyFixed) {
          concurrency = state.flowsContexts.length;
        }

        let freeFlowsLeft = concurrency - flows.size;

        if (freeFlowsLeft <= 0) return;

        const retryDistinctFlows = this.options.errorHandlingPolicy.retryDistinctFlows;
        const freeContexts = new Set<TFlowContext>();

        for (const ctx of state.flowsContexts) {
          if (!flows.has(ctx)) {
            freeContexts.add(ctx);
          }
        }

        if (retryDistinctFlows) {
          const retryQueue: {
            pendingRetry: (typeof pendingRetries)[number];
            availableFlows: Set<TFlowContext>;
          }[] = [];
          const compatibilityMap = new Map<TFlowContext, (typeof retryQueue)[number]>();

          for (const pendingRetry of pendingRetries) {
            const availableFlows: TFlowContext[] = [];

            if (pendingRetry.flows.size >= state.flowsContexts.length) {
              pendingRetry.flows = new Set();
              availableFlows.push(...freeContexts);
            } else {
              for (const ctx of freeContexts) {
                if (!pendingRetry.flows.has(ctx)) {
                  availableFlows.push(ctx);
                }
              }
            }

            const compatibility: (typeof retryQueue)[number] = {
              pendingRetry,
              availableFlows: new Set(),
            };

            for (const ctx of availableFlows) {
              const compared = compatibilityMap.get(ctx);

              if (compared) {
                // Leave at least one flow
                if (compared.availableFlows.size <= 1) continue;

                compared.availableFlows.delete(ctx);
              }

              compatibility.availableFlows.add(ctx);
              compatibilityMap.set(ctx, compatibility);
            }

            if (compatibility.availableFlows.size) {
              retryQueue.push(compatibility);

              if (--freeFlowsLeft <= 0) break;
            }
          }

          for (const { pendingRetry, availableFlows } of retryQueue) {
            const [ctx] = availableFlows;

            if (!ctx) {
              // This should never happen
              return this._forcedStopOnError(
                new Error('Unexpected error. No context for queued pending retry'),
              );
            }

            const pendingRetryIndex = pendingRetries.indexOf(pendingRetry);
            if (pendingRetryIndex !== -1) {
              pendingRetries.splice(pendingRetryIndex, 1);
            }

            freeContexts.delete(ctx);
            flows.add(ctx);

            void handleFlowExecution(ctx, pendingRetry);
          }

          if (freeFlowsLeft <= 0) return;
        }

        for (const ctx of freeContexts) {
          const pendingRetry = retryDistinctFlows ? undefined : pendingRetries.shift();

          if (executorDone && !pendingRetry) break;

          flows.add(ctx);

          void handleFlowExecution(ctx, pendingRetry);

          if (--freeFlowsLeft <= 0) break;
        }
      };

      startFlows();

      function done(): void {
        executorDone = true;
      }

      function finish(): void {
        if (resolved) return;

        resolved = true;
        resolve();

        signal.removeEventListener('abort', finish);
      }
    });
  }

  /**
   * @returns {} `true` if updated successfully, `false` if an error occurred and execution stopped.
   */
  private _updateFlowsContexts(beforeCycleStart?: boolean): boolean {
    const state = this.#state;

    if (beforeCycleStart) {
      if (!state.isFirstContextInit && !this.options.resetFlowContext) {
        return true;
      }

      const newFlowsContexts: TFlowContext[] = [];
      const oneCtxOrArray = this._initFlowContext(
        state.isConcurrencyFixed ? undefined : state.flowsContexts[0],
      );

      if (Array.isArray(oneCtxOrArray)) {
        newFlowsContexts.push(...oneCtxOrArray);

        state.isConcurrencyFixed = true;
        state.flowsContexts = newFlowsContexts;

        return true;
      } else if (typeof oneCtxOrArray !== 'undefined') {
        newFlowsContexts.push(oneCtxOrArray);

        const { concurrency, removeContextForRedundantFlows } = this._getConcurrencyOptions();

        for (let i = 1; i < concurrency; i++) {
          const ctx = this._initFlowContext(state.flowsContexts[i]);

          if (Array.isArray(ctx)) {
            this._forcedStopOnError(new Error('Inconsistent flow context return type'));

            return false;
          } else if (typeof ctx !== 'undefined') {
            newFlowsContexts.push(ctx);
          } else {
            return false;
          }
        }

        if (!removeContextForRedundantFlows) {
          const redundantFlowsContexts = state.flowsContexts.slice(newFlowsContexts.length);

          if (redundantFlowsContexts.length) {
            newFlowsContexts.push(...redundantFlowsContexts);
          }
        }

        state.isConcurrencyFixed = false;
        state.flowsContexts = newFlowsContexts;

        return true;
      } else {
        return false;
      }
    } else {
      if (state.isConcurrencyFixed) {
        return true;
      }

      const { concurrency } = this._getConcurrencyOptions();

      for (let i = state.flowsContexts.length; i < concurrency; i++) {
        const ctx = this._initFlowContext();

        if (Array.isArray(ctx)) {
          this._forcedStopOnError(new Error('Inconsistent flow context return type'));

          return false;
        } else if (typeof ctx !== 'undefined') {
          state.flowsContexts.push(ctx);
        } else {
          return false;
        }
      }

      return true;
    }
  }

  /**
   * @returns {} Flow context object(s), or `undefined` if an error occurred and execution stopped.
   */
  private _initFlowContext(oldCtx?: TFlowContext): TFlowContext | TFlowContext[] | undefined {
    try {
      const ctx = this.options.initFlowContext.call(this.globalContext, oldCtx);

      if (Array.isArray(ctx)) {
        if (!ctx.length) {
          this._forcedStopOnError(new Error('Flow context array cannot be empty'));

          return;
        }

        for (const item of ctx) {
          if (typeof item !== 'object') {
            this._forcedStopOnError(new TypeError('Flow context should be an object'));

            return;
          }
        }
      } else if (typeof ctx !== 'object') {
        this._forcedStopOnError(new TypeError('Flow context should be an object'));

        return;
      }

      return ctx;
    } catch (e) {
      this._forcedStopOnError(e);

      return;
    }
  }

  private _initFailCounter() {
    const pageFailTimeline: (number | undefined)[] = [];
    let totalPageFails = 0;
    let consecutivePageFails = 0;

    const canSkipPage = (): boolean =>
      this.options.errorHandlingPolicy.skipPageIfPossible &&
      totalPageFails <= this.options.errorHandlingPolicy.maxTotalPageFails &&
      consecutivePageFails <= this.options.errorHandlingPolicy.maxConsecutivePageFails;

    return {
      success: (): void => {
        if (typeof pageFailTimeline[pageFailTimeline.length - 1] !== 'undefined') {
          pageFailTimeline.push(undefined);
        }
        consecutivePageFails = 0;
      },
      /**
       * @returns {} `true` if cannot skip more pages.
       */
      fail: (page?: number): boolean => {
        if (typeof page !== 'undefined') {
          pageFailTimeline.push(page);
        }
        totalPageFails++;
        consecutivePageFails++;

        return !canSkipPage();
      },
      /**
       * @returns {} `true` if cycle can be marked as completed.
       */
      complete: (lastPage?: number): boolean => {
        // Recalculate totalPageFails and consecutivePageFails only up to the last page
        if (typeof lastPage !== 'undefined') {
          totalPageFails = 0;
          consecutivePageFails = 0;

          let currentConsPageFails = 0;

          for (let i = 0, l = pageFailTimeline.length; i < l; i++) {
            const page = pageFailTimeline[i];

            if (typeof page !== 'undefined') {
              if (page <= lastPage) {
                totalPageFails++;
                currentConsPageFails++;
              }

              // Skip if not last
              if (i + 1 < l) continue;
            }

            if (currentConsPageFails > consecutivePageFails) {
              consecutivePageFails = currentConsPageFails;
            }

            currentConsPageFails = 0;
          }
        }

        return canSkipPage();
      },
    };
  }

  private _handleResponse(ctx: TFlowContext, response: TResponse): void {
    const responseHandler = this.options.responseHandler;

    if (typeof responseHandler !== 'function') return;

    void (async () => {
      try {
        await responseHandler.call(this.globalContext, ctx, response);
      } catch (e) {
        this._log('responseHandleError', e);
      }
    })();
  }

  private _computeInterval(property: 'interval' | 'cycleInterval', ctx?: TFlowContext): number {
    let interval = this.options[property];

    if (typeof interval === 'undefined') {
      interval = this.options.interval;
    }

    if (typeof interval === 'function') {
      try {
        interval = Math.max(0, Math.trunc(interval.call(this.globalContext, ctx)));

        if (!Number.isFinite(interval)) {
          this._log(
            'generalError',
            new Error(
              `Invalid value returned for interval "${interval}". Must be a finite number.`,
            ),
          );

          interval = undefined;
        }
      } catch (e) {
        this._log('generalError', e);

        interval = undefined;
      }

      if (typeof interval === 'undefined') {
        // Using the default value in case of a function error or returning invalid value
        interval = [1000, 2000];
      }
    }

    if (Array.isArray(interval)) {
      interval = Math.floor(Math.random() * (interval[1] - interval[0] + 1)) + interval[0];
    }

    return interval;
  }

  private _getConcurrencyOptions() {
    let concurrency: number;
    let removeContextForRedundantFlows: boolean;
    let concurrencySupported: boolean;

    switch (this.options.paginationType) {
      case PaginationType.None:
      case PaginationType.Cursor:
        concurrency = 1;
        removeContextForRedundantFlows = true;
        concurrencySupported = false;

        break;
      case PaginationType.TotalPages:
      case PaginationType.HasMore:
      case PaginationType.List:
        concurrency = this.options.concurrency;
        removeContextForRedundantFlows = this.options.removeContextForRedundantFlows;
        concurrencySupported = true;
    }

    return {
      concurrency,
      removeContextForRedundantFlows,
      concurrencySupported,
    };
  }

  private _forcedStopOnError(err: unknown): void {
    // Forced stop and error event on promise resolve
    this.stop(true).finally(() => this._log('generalError', err));
  }

  private _log<EventName extends LogType>(
    eventName: EventName,
    ...args: Parameters<ScraperFlowEvents[EventName]>
  ): void {
    // It is important to execute this on the next tick, because this.options might not be ready
    process.nextTick(() => {
      // We are emitting an event regardless of the logger option
      this.emit(eventName, ...args);

      if (
        !this.options.logger ||
        (Array.isArray(this.options.logger) && !this.options.logger.includes(eventName))
      ) {
        return; // Printing is disabled for this log type
      }

      const title = eventName.charAt(0).toUpperCase() + eventName.slice(1);

      if (eventName === 'validationWarning') {
        console.warn(`ScraperFlow [${title}] ${String(args[0])}: ${String(args[1])}`);
      } else {
        console.error(`ScraperFlow [${title}]:`, args[0]);
      }
    });
  }

  private _emitNextTick<EventName extends keyof ScraperFlowEvents>(
    eventName: EventName,
    ...args: Parameters<ScraperFlowEvents[EventName]>
  ): void {
    process.nextTick(() => this.emit(eventName, ...args));
  }

  //----- Type-safe event listeners -----//

  override on<EventName extends keyof ScraperFlowEvents>(
    eventName: EventName,
    listener: ScraperFlowEvents[EventName],
  ): this {
    return super.on(eventName, listener);
  }
  override once<EventName extends keyof ScraperFlowEvents>(
    eventName: EventName,
    listener: ScraperFlowEvents[EventName],
  ): this {
    return super.once(eventName, listener);
  }
  override emit<EventName extends keyof ScraperFlowEvents>(
    eventName: EventName,
    ...args: Parameters<ScraperFlowEvents[EventName]>
  ): boolean {
    return super.emit(eventName, ...args);
  }
}

interface ScraperFlowEvents {
  started(): void;
  stopped(): void;
  cycleSummary(summary: CycleSummary): void;
  validationWarning(key: string, msg: string): void;
  generalError(err: unknown): void;
  fetchError(err: unknown, args: unknown[]): void;
  resolveError(err: unknown): void;
  responseHandleError(err: unknown): void;
  summaryHandleError(err: unknown): void;
}
