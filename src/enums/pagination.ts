export enum PaginationType {
  /**
   * Single page. No pagination required.
   */
  None,
  /**
   * The response contains information about the last page.
   */
  TotalPages,
  /**
   * The total number of pages cannot be pre-calculated.
   */
  HasMore,
  /**
   * A cursor from the previous page is needed to fetch the next page.
   */
  Cursor,
  /**
   * Predefined list of links or other request options.
   */
  List,
}
