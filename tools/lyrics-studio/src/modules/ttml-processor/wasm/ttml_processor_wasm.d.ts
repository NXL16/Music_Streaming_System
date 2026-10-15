/* tslint:disable */
/* eslint-disable */

/**
 * Convenience method: generate TTML string from AMLL format lyrics and metadata
 *
 * Normalizes text, e.g. cleaning spaces and removing background vocal parentheses
 */
export function amllToTtml(amll_val: any, options_val: any, config_val: any): any;

/**
 * Utility method: convert AMLL format lyrics and metadata to `TTMLResult` structure
 *
 * Normalizes text, e.g. cleaning spaces and removing background vocal parentheses
 */
export function amllToTtmlResult(amll_val: any, options_val: any): any;

/**
 * Generate TTML string from parsed TTML struct
 */
export function generateTtml(ttml_result_val: any, config_val: any): any;

export function main_js(): void;

/**
 * Parse TTML string into `TTMLResult`
 */
export function parseTtml(ttml_content: string): any;

/**
 * Utility method: downgrade parser's complex data structure to simpler AMLL data structure
 */
export function ttmlResultToAmll(ttml_result_val: any, options_val: any): any;

/**
 * Convenience method: convert and downgrade TTML string to simpler AMLL structure
 */
export function ttmlToAmll(ttml_content: string, options_val: any): any;
