import { PaginationType } from '../enums/pagination.js';
import type {
  ScraperFlowOptions,
  IntervalStrategy,
  LogType,
} from '../types/scraper-flow-options.js';
import type { ValidatedScraperFlowOptions } from '../types/validated-options.js';

// All options with default values
const DEFAULT_OPTIONS = {
  interval: [1000, 2000] as [number, number],
  intervalStrategy: 'dynamic' as IntervalStrategy,
  cycleInterval: undefined,
  cycleIntervalStrategy: 'fixed' as IntervalStrategy,
  initThisContext: () => ({}),
  resetThisContext: false,
  initFlowContext: () => ({}),
  resetFlowContext: false,
  responseHandler: undefined,
  summaryHandler: undefined,
  errorHandlingPolicy: {
    retryLimit: 2,
    retryDistinctFlows: true,
    skipPageIfPossible: false,
    maxTotalPageFails: Number.POSITIVE_INFINITY,
    maxConsecutivePageFails: Number.POSITIVE_INFINITY,
  },
  logger: ['validationWarning', 'generalError'] as LogType[],
  concurrency: 1,
  removeContextForRedundantFlows: true,
  paginationType: PaginationType.None,
  fetchHandler: undefined,
  paginationStart: 1,
  paginationPrefetch: false,
  resolveTotalPages: undefined,
  resolveHasMore: undefined,
  resolveCursor: undefined,
  resolveList: undefined,
};
// Used for type safety here, to prevent missing keys
const ALL_OPTIONS_REQUIRED: AllUnionDeepRequiredAndUndefinable<
  ScraperFlowOptions<unknown, unknown, unknown, unknown, unknown>
> = DEFAULT_OPTIONS;

export function validateOptions<
  TPaginationType extends PaginationType,
  TThisContext,
  TFlowContext,
  TResponse,
  TCursor,
  TPageListItem,
>(
  options: ScraperFlowOptions<TThisContext, TFlowContext, TResponse, TCursor, TPageListItem>,
  logger: (key: string, msg: string) => void,
): ValidatedScraperFlowOptions<
  TPaginationType,
  TThisContext,
  TFlowContext,
  TResponse,
  TCursor,
  TPageListItem
> {
  const validatedOptions = new Proxy(
    {} as unknown as ValidatedScraperFlowOptions<
      TPaginationType,
      TThisContext,
      TFlowContext,
      TResponse,
      TCursor,
      TPageListItem
    >,
    {
      /**
       * Validating options.
       */
      set: (target, p, value) => {
        const keyPath = `options.${p.toString()}`;

        switch (p) {
          // Pagination Type
          case 'paginationType':
            if (typeof target[p] === 'undefined') {
              Object.defineProperty(target, p, {
                configurable: true,
                enumerable: true,
                value:
                  typeof value === 'number' && value in PaginationType ? value : DEFAULT_OPTIONS[p],
                writable: false,
              });

              return true;
            }

            logger(keyPath, 'Readonly property.');

            return true;
          // Intervals
          case 'interval':
          case 'cycleInterval':
            if (p === 'interval' && typeof target[p] === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];
            }

            if (typeof value === 'number') {
              if (Number.isFinite(value)) {
                target[p] = Math.max(0, Math.trunc(value));

                return true;
              }

              logger(keyPath, `Invalid number value "${value}". Must be a finite number.`);

              return true;
            }
            if (typeof value === 'function') {
              target[p] = value as () => number;

              return true;
            }
            if (Array.isArray(value)) {
              const start: unknown = value[0];
              const end: unknown = value[1];

              if (
                typeof start === 'number' &&
                Number.isFinite(start) &&
                typeof end === 'number' &&
                Number.isFinite(end)
              ) {
                target[p] = [Math.max(0, Math.trunc(start)), Math.max(0, Math.trunc(end))];

                return true;
              }

              logger(keyPath, `Invalid interval range "${value.slice(0, 2).join(' - ')}".`);

              return true;
            }
            if (typeof value === 'undefined') {
              if (p === 'interval') {
                target[p] = DEFAULT_OPTIONS[p];
              } else {
                target[p] = undefined;
              }

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          // Interval strategies
          case 'intervalStrategy':
          case 'cycleIntervalStrategy':
            if (typeof target[p] === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];
            }

            if (typeof value === 'string') {
              if (value === 'dynamic' || value === 'fixed') {
                target[p] = value;

                return true;
              }

              logger(keyPath, `Invalid interval strategy "${value}".`);

              return true;
            }
            if (typeof value === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          // Numbers
          case 'concurrency':
          case 'paginationStart':
            if (typeof target[p] === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];
            }

            if (typeof value === 'number') {
              if (Number.isFinite(value)) {
                const intValue = Math.trunc(value);

                target[p] = p === 'concurrency' ? Math.max(1, intValue) : intValue;

                return true;
              }

              logger(keyPath, `Invalid number value "${value}". Must be a finite number.`);

              return true;
            }
            if (typeof value === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          // Booleans
          case 'resetThisContext':
          case 'resetFlowContext':
          case 'removeContextForRedundantFlows':
          case 'paginationPrefetch':
            if (typeof target[p] === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];
            }

            if (typeof value === 'boolean') {
              target[p] = value;

              return true;
            }
            if (typeof value === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          // Context init functions
          case 'initThisContext':
          case 'initFlowContext':
            if (typeof target[p] === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p] as (...args: unknown[]) => never;
            }

            if (typeof value === 'function') {
              target[p] = value as (...args: unknown[]) => never;

              return true;
            }
            if (typeof value === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p] as (...args: unknown[]) => never;

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          // Required functions
          case 'fetchHandler':
          case 'resolveTotalPages':
          case 'resolveHasMore':
          case 'resolveCursor':
          case 'resolveList':
            if (typeof value === 'function') {
              target[p] = value as (...args: unknown[]) => never;

              return true;
            }

            if (typeof value !== 'undefined') {
              logger(keyPath, `Invalid value "${String(value)}".`);
            }

            return true;
          // Optional functions
          case 'responseHandler':
          case 'summaryHandler':
            if (typeof value === 'function' || typeof value === 'undefined') {
              target[p] = value as ((...args: unknown[]) => never) | undefined;

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          // Error Handling Policy
          case 'errorHandlingPolicy':
            if (typeof target[p] === 'undefined') {
              target[p] = new Proxy(
                {} as unknown as (typeof validatedOptions)['errorHandlingPolicy'],
                {
                  set: (target, p, value) => {
                    const keyPath = `options.errorHandlingPolicy.${p.toString()}`;

                    switch (p) {
                      // Numbers
                      case 'retryLimit':
                      case 'maxTotalPageFails':
                      case 'maxConsecutivePageFails':
                        if (typeof target[p] === 'undefined') {
                          target[p] = DEFAULT_OPTIONS.errorHandlingPolicy[p];
                        }

                        if (typeof value === 'number') {
                          if (!Number.isNaN(value)) {
                            target[p] = Math.max(0, Math.trunc(value));

                            return true;
                          }

                          logger(keyPath, `Invalid number value "${value}".`);

                          return true;
                        }
                        if (typeof value === 'undefined') {
                          target[p] = DEFAULT_OPTIONS.errorHandlingPolicy[p];

                          return true;
                        }

                        logger(keyPath, `Invalid value "${String(value)}".`);

                        return true;
                      // Booleans
                      case 'retryDistinctFlows':
                      case 'skipPageIfPossible':
                        if (typeof target[p] === 'undefined') {
                          target[p] = DEFAULT_OPTIONS.errorHandlingPolicy[p];
                        }

                        if (typeof value === 'boolean') {
                          target[p] = value;

                          return true;
                        }
                        if (typeof value === 'undefined') {
                          target[p] = DEFAULT_OPTIONS.errorHandlingPolicy[p];

                          return true;
                        }

                        logger(keyPath, `Invalid value "${String(value)}".`);

                        return true;
                      default:
                        logger(keyPath, 'Unknown property.');

                        return true;
                    }
                  },
                  deleteProperty: () => false,
                },
              );
            }

            // Applying provided options
            for (const k of Object.keys(DEFAULT_OPTIONS.errorHandlingPolicy)) {
              target[p][k] = value ? ((value as object)[k] as unknown) : undefined;
            }

            return true;
          // Logger
          case 'logger':
            if (typeof target[p] === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];
            }

            if (typeof value === 'boolean' || Array.isArray(value)) {
              target[p] = value;

              return true;
            }
            if (typeof value === 'undefined') {
              target[p] = DEFAULT_OPTIONS[p];

              return true;
            }

            logger(keyPath, `Invalid value "${String(value)}".`);

            return true;
          default:
            logger(keyPath, 'Unknown property.');

            return true;
        }
      },
      deleteProperty: () => false,
    },
  );

  for (const k of Object.keys(ALL_OPTIONS_REQUIRED)) {
    validatedOptions[k] = options[k] as unknown;
  }

  // Validating required common options
  if (typeof validatedOptions.fetchHandler === 'undefined') {
    throw new Error('Property "fetchHandler" is required');
  }

  // And individual options for each pagination type
  if (validatedOptions.paginationType === PaginationType.TotalPages) {
    if (typeof validatedOptions.resolveTotalPages === 'undefined') {
      throw new Error('Property "resolveTotalPages" is required');
    }
  } else if (validatedOptions.paginationType === PaginationType.HasMore) {
    if (typeof validatedOptions.resolveHasMore === 'undefined') {
      throw new Error('Property "resolveHasMore" is required');
    }
  } else if (validatedOptions.paginationType === PaginationType.Cursor) {
    if (typeof validatedOptions.resolveCursor === 'undefined') {
      throw new Error('Property "resolveCursor" is required');
    }
  } else if (validatedOptions.paginationType === PaginationType.List) {
    if (typeof validatedOptions.resolveList === 'undefined') {
      throw new Error('Property "resolveList" is required');
    }
  }

  return validatedOptions;
}

// Makes all union properties required and undefinable
type AllUnionDeepRequiredAndUndefinable<Type> = Type extends  // eslint-disable-next-line @typescript-eslint/ban-types
  | Function
  | Date
  | Error
  | RegExp
  | unknown[]
  ? Type
  : Type extends object
  ? {
      [Key in Type extends unknown ? keyof Type : never]-?:
        | AllUnionDeepRequiredAndUndefinable<Type[Key]>
        | undefined;
    }
  : Type;
