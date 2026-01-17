import type { StoredAuthFile } from "../store/types.js";
import type { TokenStore } from "../store/types.js";
import type {
	RuntimeAuth,
	ProviderExecutor,
	ExecutorRequest,
	ExecutorResponse,
	ExecutorOptions,
	StreamChunk,
	ExecutionResult,
	ExecutionError,
	QuotaState,
} from "./types.js";
import { toRuntimeAuth, StatusError } from "./types.js";
import {
	type Selector,
	RoundRobinSelector,
	ModelCooldownError,
} from "./selector.js";

const QUOTA_BACKOFF_BASE_MS = 1000;
const QUOTA_BACKOFF_MAX_MS = 30 * 60 * 1000;

export interface PoolHook {
	onAuthRegistered?(auth: RuntimeAuth): void;
	onAuthUpdated?(auth: RuntimeAuth): void;
	onResult?(result: ExecutionResult): void;
}

class NoopHook implements PoolHook {}

export interface CredentialPoolConfig {
	store: TokenStore;
	selector?: Selector;
	hook?: PoolHook;
	retryCount?: number;
	maxRetryWaitMs?: number;
}

export class CredentialPool {
	private store: TokenStore;
	private executors = new Map<string, ProviderExecutor>();
	private selector: Selector;
	private hook: PoolHook;
	private auths = new Map<string, RuntimeAuth>();
	private providerOffsets = new Map<string, number>();
	private retryCount: number;
	private maxRetryWaitMs: number;

	constructor(config: CredentialPoolConfig) {
		this.store = config.store;
		this.selector = config.selector ?? new RoundRobinSelector();
		this.hook = config.hook ?? new NoopHook();
		this.retryCount = config.retryCount ?? 0;
		this.maxRetryWaitMs = config.maxRetryWaitMs ?? 0;
	}

	setSelector(selector: Selector): void {
		this.selector = selector ?? new RoundRobinSelector();
	}

	setRetryConfig(retryCount: number, maxRetryWaitMs: number): void {
		this.retryCount = Math.max(0, retryCount);
		this.maxRetryWaitMs = Math.max(0, maxRetryWaitMs);
	}

	registerExecutor(executor: ProviderExecutor): void {
		this.executors.set(executor.identifier(), executor);
	}

	unregisterExecutor(provider: string): void {
		this.executors.delete(provider.toLowerCase().trim());
	}

	async load(): Promise<void> {
		const stored = await this.store.listAuthFiles();
		this.auths.clear();
		for (const auth of stored) {
			if (!auth.id) continue;
			const runtime = toRuntimeAuth(auth);
			this.auths.set(auth.id, runtime);
		}
	}

	async register(auth: StoredAuthFile): Promise<RuntimeAuth> {
		const runtime = toRuntimeAuth(auth);
		this.auths.set(auth.id, runtime);
		await this.store.saveAuthFile(auth);
		this.hook.onAuthRegistered?.(runtime);
		return runtime;
	}

	async update(auth: StoredAuthFile): Promise<RuntimeAuth> {
		const existing = this.auths.get(auth.id);
		const runtime = toRuntimeAuth(auth);
		if (existing) {
			runtime.modelStates = existing.modelStates;
			runtime.quota = existing.quota;
			runtime.runtimeStatus = existing.runtimeStatus;
		}
		this.auths.set(auth.id, runtime);
		await this.store.saveAuthFile(auth);
		this.hook.onAuthUpdated?.(runtime);
		return runtime;
	}

	list(): RuntimeAuth[] {
		return Array.from(this.auths.values());
	}

	getById(id: string): RuntimeAuth | undefined {
		return this.auths.get(id);
	}

	async execute(
		providers: string[],
		request: ExecutorRequest,
		options: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse> {
		const normalized = this.normalizeProviders(providers);
		if (normalized.length === 0) {
			throw new StatusError(400, "no provider supplied");
		}

		const attempts = this.retryCount + 1;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < attempts; attempt++) {
			try {
				return await this.executeMixedOnce(normalized, request, options, signal);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				const { wait, shouldRetry } = this.shouldRetryAfterError(
					lastError,
					attempt,
					attempts,
					normalized,
					request.model,
				);
				if (!shouldRetry) break;
				await this.sleep(wait, signal);
			}
		}

		throw lastError ?? new StatusError(500, "no auth available");
	}

	async *executeStream(
		providers: string[],
		request: ExecutorRequest,
		options: ExecutorOptions,
		signal?: AbortSignal,
	): AsyncGenerator<StreamChunk> {
		const normalized = this.normalizeProviders(providers);
		if (normalized.length === 0) {
			throw new StatusError(400, "no provider supplied");
		}

		const attempts = this.retryCount + 1;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < attempts; attempt++) {
			try {
				const generator = await this.executeStreamMixedOnce(
					normalized,
					request,
					options,
					signal,
				);
				for await (const chunk of generator) {
					yield chunk;
				}
				return;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				const { wait, shouldRetry } = this.shouldRetryAfterError(
					lastError,
					attempt,
					attempts,
					normalized,
					request.model,
				);
				if (!shouldRetry) break;
				await this.sleep(wait, signal);
			}
		}

		throw lastError ?? new StatusError(500, "no auth available");
	}

	markResult(result: ExecutionResult): void {
		const runtime = this.auths.get(result.authId);
		if (!runtime) return;

		const now = new Date();

		if (result.success) {
			this.handleSuccess(runtime, result.model, now);
		} else {
			this.handleFailure(runtime, result, now);
		}

		this.hook.onResult?.(result);
	}

	private async executeMixedOnce(
		providers: string[],
		request: ExecutorRequest,
		options: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse> {
		const tried = new Set<string>();
		let lastError: Error | undefined;

		while (true) {
			const picked = this.pickNextMixed(providers, request.model, options, tried);
			if (!picked) {
				throw lastError ?? new StatusError(500, "no auth available");
			}

			const { auth, executor, provider } = picked;
			tried.add(auth.auth.id);

			try {
				const response = await executor.execute(auth.auth, request, options, signal);
				this.markResult({
					authId: auth.auth.id,
					provider,
					model: request.model,
					success: true,
				});
				return response;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				const execError = this.toExecutionError(lastError);
				this.markResult({
					authId: auth.auth.id,
					provider,
					model: request.model,
					success: false,
					error: execError,
					retryAfter: this.extractRetryAfter(lastError),
				});
			}
		}
	}

	private async executeStreamMixedOnce(
		providers: string[],
		request: ExecutorRequest,
		options: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<AsyncGenerator<StreamChunk>> {
		const tried = new Set<string>();
		let lastError: Error | undefined;

		while (true) {
			const picked = this.pickNextMixed(providers, request.model, options, tried);
			if (!picked) {
				throw lastError ?? new StatusError(500, "no auth available");
			}

			const { auth, executor, provider } = picked;
			tried.add(auth.auth.id);

			try {
				const generator = executor.executeStream(auth.auth, request, options, signal);
				const self = this;
				const authId = auth.auth.id;
				const model = request.model;

				return (async function* () {
					let failed = false;
					try {
						for await (const chunk of generator) {
							if (chunk.error && !failed) {
								failed = true;
								self.markResult({
									authId,
									provider,
									model,
									success: false,
									error: self.toExecutionError(chunk.error),
								});
							}
							yield chunk;
						}
						if (!failed) {
							self.markResult({
								authId,
								provider,
								model,
								success: true,
							});
						}
					} catch (streamErr) {
						if (!failed) {
							const err =
								streamErr instanceof Error ? streamErr : new Error(String(streamErr));
							self.markResult({
								authId,
								provider,
								model,
								success: false,
								error: self.toExecutionError(err),
							});
						}
						throw streamErr;
					}
				})();
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				const execError = this.toExecutionError(lastError);
				this.markResult({
					authId: auth.auth.id,
					provider,
					model: request.model,
					success: false,
					error: execError,
					retryAfter: this.extractRetryAfter(lastError),
				});
			}
		}
	}

	private pickNextMixed(
		providers: string[],
		model: string,
		options: ExecutorOptions,
		tried: Set<string>,
	): { auth: RuntimeAuth; executor: ProviderExecutor; provider: string } | null {
		const rotated = this.rotateProviders(model, providers);

		for (const provider of rotated) {
			const executor = this.executors.get(provider);
			if (!executor) continue;

			const candidates = Array.from(this.auths.values()).filter(
				(a) =>
					a.auth.provider.toLowerCase() === provider && !tried.has(a.auth.id),
			);

			if (candidates.length === 0) continue;

			const auth = this.selector.pick(provider, model, options, candidates);
			if (auth) {
				return { auth, executor, provider };
			}
		}

		return null;
	}

	private rotateProviders(model: string, providers: string[]): string[] {
		if (providers.length === 0) return [];

		let offset = this.providerOffsets.get(model) ?? 0;
		this.providerOffsets.set(model, (offset + 1) % providers.length);

		if (offset >= providers.length) offset = 0;
		if (offset === 0) return providers;

		return [...providers.slice(offset), ...providers.slice(0, offset)];
	}

	private normalizeProviders(providers: string[]): string[] {
		const seen = new Set<string>();
		const result: string[] = [];

		for (const p of providers) {
			const normalized = p.toLowerCase().trim();
			if (normalized && !seen.has(normalized)) {
				seen.add(normalized);
				result.push(normalized);
			}
		}

		return result;
	}

	private handleSuccess(runtime: RuntimeAuth, model: string, now: Date): void {
		if (model) {
			const state = runtime.modelStates.get(model);
			if (state) {
				state.unavailable = false;
				state.status = "active";
				state.statusMessage = undefined;
				state.nextRetryAfter = undefined;
				state.lastError = undefined;
				state.quota = { exceeded: false, backoffLevel: 0 };
				state.updatedAt = now;
			}
		}

		runtime.unavailable = false;
		runtime.runtimeStatus = "active";
		runtime.statusMessage = undefined;
		runtime.lastError = undefined;
		runtime.nextRetryAfter = undefined;
		runtime.quota = { exceeded: false, backoffLevel: 0 };
		runtime.runtimeUpdatedAt = now;
	}

	private handleFailure(
		runtime: RuntimeAuth,
		result: ExecutionResult,
		now: Date,
	): void {
		const model = result.model;

		if (model) {
			let state = runtime.modelStates.get(model);
			if (!state) {
				state = {
					status: "active",
					unavailable: false,
					quota: { exceeded: false, backoffLevel: 0 },
					updatedAt: now,
				};
				runtime.modelStates.set(model, state);
			}

			state.unavailable = true;
			state.status = "error";
			state.lastError = result.error;
			state.statusMessage = result.error?.message;
			state.updatedAt = now;

			const statusCode = result.error?.httpStatus ?? 0;
			this.applyStatusCodeCooldown(state.quota, statusCode, result.retryAfter, now);

			if (statusCode === 429) {
				state.nextRetryAfter = state.quota.nextRecoverAt;
			} else if (statusCode === 401 || statusCode === 402 || statusCode === 403) {
				state.nextRetryAfter = new Date(now.getTime() + 30 * 60 * 1000);
			} else if (statusCode === 404) {
				state.nextRetryAfter = new Date(now.getTime() + 12 * 60 * 60 * 1000);
			} else if ([408, 500, 502, 503, 504].includes(statusCode)) {
				state.nextRetryAfter = new Date(now.getTime() + 60 * 1000);
			}
		}

		runtime.runtimeStatus = "error";
		runtime.lastError = result.error;
		runtime.statusMessage = result.error?.message;
		runtime.runtimeUpdatedAt = now;
	}

	private applyStatusCodeCooldown(
		quota: QuotaState,
		statusCode: number,
		retryAfterMs: number | undefined,
		now: Date,
	): void {
		if (statusCode !== 429) return;

		quota.exceeded = true;
		quota.reason = "quota";

		if (retryAfterMs !== undefined) {
			quota.nextRecoverAt = new Date(now.getTime() + retryAfterMs);
		} else {
			const { cooldown, nextLevel } = this.nextQuotaCooldown(quota.backoffLevel);
			quota.nextRecoverAt = new Date(now.getTime() + cooldown);
			quota.backoffLevel = nextLevel;
		}
	}

	private nextQuotaCooldown(prevLevel: number): { cooldown: number; nextLevel: number } {
		const level = Math.max(0, prevLevel);
		const cooldown = Math.min(
			QUOTA_BACKOFF_BASE_MS * Math.pow(2, level),
			QUOTA_BACKOFF_MAX_MS,
		);

		if (cooldown >= QUOTA_BACKOFF_MAX_MS) {
			return { cooldown: QUOTA_BACKOFF_MAX_MS, nextLevel: level };
		}

		return { cooldown, nextLevel: level + 1 };
	}

	private shouldRetryAfterError(
		_err: Error,
		attempt: number,
		maxAttempts: number,
		providers: string[],
		model: string,
	): { wait: number; shouldRetry: boolean } {
		if (attempt >= maxAttempts - 1 || this.maxRetryWaitMs <= 0) {
			return { wait: 0, shouldRetry: false };
		}

		const { wait, found } = this.closestCooldownWait(providers, model);
		if (!found || wait > this.maxRetryWaitMs) {
			return { wait: 0, shouldRetry: false };
		}

		return { wait, shouldRetry: true };
	}

	private closestCooldownWait(
		providers: string[],
		model: string,
	): { wait: number; found: boolean } {
		const providerSet = new Set(providers.map((p) => p.toLowerCase().trim()));
		const now = Date.now();
		let minWait = Infinity;
		let found = false;

		for (const auth of this.auths.values()) {
			if (!providerSet.has(auth.auth.provider.toLowerCase())) continue;

			const state = auth.modelStates.get(model);
			if (state?.nextRetryAfter) {
				const wait = state.nextRetryAfter.getTime() - now;
				if (wait > 0 && wait < minWait) {
					minWait = wait;
					found = true;
				}
			}
		}

		return { wait: found ? minWait : 0, found };
	}

	private toExecutionError(err: Error): ExecutionError {
		const result: ExecutionError = {
			message: err.message,
			retryable: false,
		};

		if (err instanceof StatusError) {
			result.httpStatus = err.statusCode;
			result.retryable = [408, 429, 500, 502, 503, 504].includes(err.statusCode);
		} else if (err instanceof ModelCooldownError) {
			result.httpStatus = 429;
			result.code = "model_cooldown";
			result.retryable = true;
		}

		return result;
	}

	private extractRetryAfter(err: Error): number | undefined {
		if (err instanceof ModelCooldownError) {
			return err.resetIn;
		}
		if (
			err instanceof StatusError &&
			err.headers?.["retry-after"]
		) {
			const val = parseInt(err.headers["retry-after"], 10);
			if (!isNaN(val)) return val * 1000;
		}
		return undefined;
	}

	private sleep(ms: number, signal?: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new Error("aborted"));
				return;
			}

			const timeout = setTimeout(resolve, ms);

			signal?.addEventListener("abort", () => {
				clearTimeout(timeout);
				reject(new Error("aborted"));
			});
		});
	}
}
