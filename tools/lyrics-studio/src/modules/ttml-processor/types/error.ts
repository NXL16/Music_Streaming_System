export interface JsError {
	/**
	 * Parser error type, such as `ParseError`, `IoError`, `Utf8Error`, or `FromUtf8Error`.
	 * `ParseError` includes details such as `byteOffset`, `lineId`, and `tagStack`.
	 */
	kind: string;

	/**
	 * User-friendly English error message.
	 */
	message?: string;

	/**
	 * Byte offset in the file where parsing failed.
	 */
	byteOffset?: number;

	/**
	 * Current lyric-line ID (for example, "L3"), or undefined before one is parsed.
	 */
	lineId?: string;

	/**
	 * Current XML tag stack (for example, `["tt", "body", "div", "p", "span"]`).
	 */
	tagStack?: string[];

	/**
	 * Attribute currently being processed.
	 */
	currentAttribute?: string;

	/**
	 * Exact source string that caused the error.
	 */
	offendingString?: string;
}
