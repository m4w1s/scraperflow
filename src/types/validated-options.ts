import type {
  PaginationForNoneOptions,
  PaginationForTotalPagesOptions,
  PaginationForHasMoreOptions,
  PaginationForCursorOptions,
  PaginationForListOptions,
} from './scraper-flow-options.js';
import type { PaginationType } from '../enums/pagination.js';

export type ValidatedPaginationForNoneOptions<TThisContext, TFlowContext, TResponse> = MarkReadonly<
  MarkOptional<
    DeepRequired<PaginationForNoneOptions<TThisContext, TFlowContext, TResponse>>,
    OptionalKeys
  >,
  ReadonlyKeys
>;

export type ValidatedPaginationForTotalPagesOptions<TThisContext, TFlowContext, TResponse> =
  MarkReadonly<
    MarkOptional<
      DeepRequired<PaginationForTotalPagesOptions<TThisContext, TFlowContext, TResponse>>,
      OptionalKeys
    >,
    ReadonlyKeys
  >;

export type ValidatedPaginationForHasMoreOptions<TThisContext, TFlowContext, TResponse> =
  MarkReadonly<
    MarkOptional<
      DeepRequired<PaginationForHasMoreOptions<TThisContext, TFlowContext, TResponse>>,
      OptionalKeys
    >,
    ReadonlyKeys
  >;

export type ValidatedPaginationForCursorOptions<TThisContext, TFlowContext, TResponse, TCursor> =
  MarkReadonly<
    MarkOptional<
      DeepRequired<PaginationForCursorOptions<TThisContext, TFlowContext, TResponse, TCursor>>,
      OptionalKeys
    >,
    ReadonlyKeys
  >;

export type ValidatedPaginationForListOptions<
  TThisContext,
  TFlowContext,
  TResponse,
  TPageListItem,
> = MarkReadonly<
  MarkOptional<
    DeepRequired<PaginationForListOptions<TThisContext, TFlowContext, TResponse, TPageListItem>>,
    OptionalKeys
  >,
  ReadonlyKeys
>;

export type ValidatedScraperFlowOptions<
  TPaginationType extends PaginationType,
  TThisContext,
  TFlowContext,
  TResponse,
  TCursor,
  TPageListItem,
> = TPaginationType extends PaginationType.None
  ? ValidatedPaginationForNoneOptions<TThisContext, TFlowContext, TResponse>
  : TPaginationType extends PaginationType.TotalPages
  ? ValidatedPaginationForTotalPagesOptions<TThisContext, TFlowContext, TResponse>
  : TPaginationType extends PaginationType.HasMore
  ? ValidatedPaginationForHasMoreOptions<TThisContext, TFlowContext, TResponse>
  : TPaginationType extends PaginationType.Cursor
  ? ValidatedPaginationForCursorOptions<TThisContext, TFlowContext, TResponse, TCursor>
  : TPaginationType extends PaginationType.List
  ? ValidatedPaginationForListOptions<TThisContext, TFlowContext, TResponse, TPageListItem>
  : never;

type ReadonlyKeys = 'paginationType';
type OptionalKeys = 'cycleInterval' | 'responseHandler' | 'summaryHandler';
// eslint-disable-next-line @typescript-eslint/ban-types
type DeepRequired<Type> = Type extends Function | Date | Error | RegExp
  ? Type
  : Type extends object
  ? {
      [Key in keyof Type]-?: DeepRequired<Type[Key]>;
    }
  : Type;
type MarkOptional<Type, Keys extends keyof Type> = Type extends Type
  ? Omit<Type, Keys> & Partial<Pick<Type, Keys>>
  : never;
type MarkReadonly<Type, Keys extends keyof Type> = Type extends Type
  ? Omit<Type, Keys> & Readonly<Pick<Type, Keys>>
  : never;
