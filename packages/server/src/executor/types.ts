/**
 * Executor types and interfaces for provider execution
 */

import type { StoredAuthFile } from "../store/types.js";

/**
 * Request represents a provider execution request
 */
export interface ExecutorRequest {
	/** Model identifier (may include thinking suffix) */
	model: string;
	/** Request payload (JSON body) */
	payload: Uint8Array;
	/** Optional metadata for request processing */
	metadata?: Record<string, unknown>;
}

/**
 * Response from a provider execution
 */
export interface ExecutorResponse {
	/** Response payload */
	payload: Uint8Array;
}

/**
 * Options for execution
 */
export interface ExecutorOptions {
	/** Enable streaming mode */
	stream: boolean;
	/** Alt parameter for response format (e.g., 'sse') */
	alt?: string;
	/** Original request payload (for translation) */
	originalRequest?: Uint8Array;
	/** Source format for translation (e.g., 'openai', 'claude', 'gemini') */
	sourceFormat?: string;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Stream chunk for streaming responses
 */
export interface StreamChunk {
	/** Chunk payload */
	payload?: Uint8Array;
	/** Error if chunk failed */
	error?: Error;
}

/**
 * Status error with HTTP status code
 */
export class StatusError extends Error {
	readonly statusCode: number;
	readonly headers?: Record<string, string>;

	constructor(
		statusCode: number,
		message: string,
		headers?: Record<string, string>,
	) {
		super(message);
		this.name = "StatusError";
		this.statusCode = statusCode;
		this.headers = headers;
	}
}

/**
 * ProviderExecutor defines the contract for executing provider requests
 */
export interface ProviderExecutor {
	/** Returns the provider key handled by this executor */
	identifier(): string;

	/** Execute non-streaming request */
	execute(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse>;

	/** Execute streaming request */
	executeStream(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): AsyncGenerator<StreamChunk>;

	/** Refresh provider credentials */
	refresh(auth: StoredAuthFile): Promise<StoredAuthFile>;

	/** Count tokens for request */
	countTokens?(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse>;

	/** Prepare HTTP request with provider credentials */
	prepareRequest?(
		auth: StoredAuthFile,
		request: Request,
	): Promise<Request>;
}

/**
 * Auth selection result
 */
export interface ExecutionResult {
	/** Auth ID that produced this result */
	authId: string;
	/** Provider identifier */
	provider: string;
	/** Model used for the request */
	model: string;
	/** Whether execution succeeded */
	success: boolean;
	/** Retry-After duration from provider (ms) */
	retryAfter?: number;
	/** Error details if failed */
	error?: ExecutionError;
}

/**
 * Execution error details
 */
export interface ExecutionError {
	code?: string;
	message: string;
	httpStatus?: number;
	retryable?: boolean;
}

/**
 * Auth status for tracking availability
 */
export type AuthStatus = "active" | "error" | "disabled" | "pending";

/**
 * Model state for per-model tracking
 */
export interface ModelState {
	status: AuthStatus;
	statusMessage?: string;
	unavailable: boolean;
	nextRetryAfter?: Date;
	lastError?: ExecutionError;
	quota: QuotaState;
	updatedAt: Date;
}

/**
 * Quota state for rate limiting
 */
export interface QuotaState {
	exceeded: boolean;
	reason?: string;
	nextRecoverAt?: Date;
	backoffLevel: number;
}

/**
 * Extended auth with runtime state (uses composition, not extension)
 */
export interface RuntimeAuth {
	/** The underlying stored auth file */
	auth: StoredAuthFile;
	/** Runtime status (may differ from stored status) */
	runtimeStatus: AuthStatus;
	/** Status message */
	statusMessage?: string;
	/** Whether temporarily unavailable */
	unavailable: boolean;
	/** Next retry time */
	nextRetryAfter?: Date;
	/** Last error encountered */
	lastError?: ExecutionError;
	/** Quota state */
	quota: QuotaState;
	/** Per-model states */
	modelStates: Map<string, ModelState>;
	/** Runtime created timestamp */
	loadedAt: Date;
	/** Runtime updated timestamp */
	runtimeUpdatedAt: Date;
	/** Last refresh timestamp */
	lastRefreshedAt?: Date;
}

export function toRuntimeAuth(stored: StoredAuthFile): RuntimeAuth {
	return {
		auth: stored,
		runtimeStatus: stored.disabled ? "disabled" : "active",
		unavailable: false,
		quota: {
			exceeded: false,
			backoffLevel: 0,
		},
		modelStates: new Map(),
		loadedAt: new Date(),
		runtimeUpdatedAt: new Date(),
	};
}

export function cloneRuntimeAuth(runtime: RuntimeAuth): RuntimeAuth {
	return {
		auth: runtime.auth,
		runtimeStatus: runtime.runtimeStatus,
		statusMessage: runtime.statusMessage,
		unavailable: runtime.unavailable,
		nextRetryAfter: runtime.nextRetryAfter,
		lastError: runtime.lastError ? { ...runtime.lastError } : undefined,
		quota: { ...runtime.quota },
		modelStates: new Map(runtime.modelStates),
		loadedAt: runtime.loadedAt,
		runtimeUpdatedAt: runtime.runtimeUpdatedAt,
		lastRefreshedAt: runtime.lastRefreshedAt,
	};
}
