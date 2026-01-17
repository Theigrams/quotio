import type { RuntimeAuth, ExecutorOptions } from "./types.js";

export type BlockReason = "none" | "cooldown" | "disabled" | "other";

export interface BlockResult {
	blocked: boolean;
	reason: BlockReason;
	nextRetry?: Date;
}

export interface Selector {
	pick(
		provider: string,
		model: string,
		opts: ExecutorOptions,
		auths: RuntimeAuth[],
	): RuntimeAuth | null;
}

function getAuthPriority(auth: RuntimeAuth): number {
	const raw = auth.auth.tokenData?.["priority"];
	if (typeof raw === "number") return raw;
	if (typeof raw === "string") {
		const parsed = parseInt(raw, 10);
		return isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

function isAuthBlockedForModel(
	auth: RuntimeAuth,
	model: string,
	now: Date,
): BlockResult {
	if (auth.auth.disabled || auth.runtimeStatus === "disabled") {
		return { blocked: true, reason: "disabled" };
	}

	if (model) {
		const state = auth.modelStates.get(model);
		if (state) {
			if (state.status === "disabled") {
				return { blocked: true, reason: "disabled" };
			}
			if (state.unavailable) {
				if (!state.nextRetryAfter) {
					return { blocked: false, reason: "none" };
				}
				if (state.nextRetryAfter > now) {
					let next = state.nextRetryAfter;
					if (state.quota.nextRecoverAt && state.quota.nextRecoverAt > now) {
						next = state.quota.nextRecoverAt;
					}
					if (next < now) next = now;

					if (state.quota.exceeded) {
						return { blocked: true, reason: "cooldown", nextRetry: next };
					}
					return { blocked: true, reason: "other", nextRetry: next };
				}
			}
			return { blocked: false, reason: "none" };
		}
		return { blocked: false, reason: "none" };
	}

	if (auth.unavailable && auth.nextRetryAfter && auth.nextRetryAfter > now) {
		let next = auth.nextRetryAfter;
		if (auth.quota.nextRecoverAt && auth.quota.nextRecoverAt > now) {
			next = auth.quota.nextRecoverAt;
		}
		if (next < now) next = now;

		if (auth.quota.exceeded) {
			return { blocked: true, reason: "cooldown", nextRetry: next };
		}
		return { blocked: true, reason: "other", nextRetry: next };
	}

	return { blocked: false, reason: "none" };
}

interface AvailableByPriority {
	available: Map<number, RuntimeAuth[]>;
	cooldownCount: number;
	earliestRetry: Date | undefined;
}

function collectAvailableByPriority(
	auths: RuntimeAuth[],
	model: string,
	now: Date,
): AvailableByPriority {
	const available = new Map<number, RuntimeAuth[]>();
	let cooldownCount = 0;
	let earliest: Date | undefined;

	for (const candidate of auths) {
		const result = isAuthBlockedForModel(candidate, model, now);
		if (!result.blocked) {
			const priority = getAuthPriority(candidate);
			const list = available.get(priority) ?? [];
			list.push(candidate);
			available.set(priority, list);
			continue;
		}

		if (result.reason === "cooldown") {
			cooldownCount++;
			if (result.nextRetry) {
				if (!earliest || result.nextRetry < earliest) {
					earliest = result.nextRetry;
				}
			}
		}
	}

	return { available, cooldownCount, earliestRetry: earliest };
}

export interface ModelCooldownInfo {
	model: string;
	provider: string;
	resetIn: number;
}

export class ModelCooldownError extends Error {
	readonly model: string;
	readonly provider: string;
	readonly resetIn: number;

	constructor(model: string, provider: string, resetIn: number) {
		const modelName = model || "requested model";
		let message = `All credentials for model ${modelName} are cooling down`;
		if (provider) {
			message += ` via provider ${provider}`;
		}
		super(message);
		this.name = "ModelCooldownError";
		this.model = model;
		this.provider = provider;
		this.resetIn = Math.max(0, resetIn);
	}

	get statusCode(): number {
		return 429;
	}

	get resetSeconds(): number {
		return Math.ceil(this.resetIn / 1000);
	}

	toJSON(): Record<string, unknown> {
		return {
			error: {
				code: "model_cooldown",
				message: this.message,
				model: this.model,
				provider: this.provider || undefined,
				reset_time: `${this.resetSeconds}s`,
				reset_seconds: this.resetSeconds,
			},
		};
	}
}

function getAvailableAuths(
	auths: RuntimeAuth[],
	provider: string,
	model: string,
	now: Date,
): RuntimeAuth[] {
	if (auths.length === 0) {
		throw new Error("no auth candidates");
	}

	const { available, cooldownCount, earliestRetry } = collectAvailableByPriority(
		auths,
		model,
		now,
	);

	if (available.size === 0) {
		if (cooldownCount === auths.length && earliestRetry) {
			const providerForError = provider === "mixed" ? "" : provider;
			const resetIn = earliestRetry.getTime() - now.getTime();
			throw new ModelCooldownError(model, providerForError, Math.max(0, resetIn));
		}
		throw new Error("no auth available");
	}

	let bestPriority = -Infinity;
	for (const priority of available.keys()) {
		if (priority > bestPriority) {
			bestPriority = priority;
		}
	}

	const result = available.get(bestPriority) ?? [];
	if (result.length > 1) {
		result.sort((a, b) => a.auth.id.localeCompare(b.auth.id));
	}

	return result;
}

export class RoundRobinSelector implements Selector {
	private cursors = new Map<string, number>();

	pick(
		provider: string,
		model: string,
		_opts: ExecutorOptions,
		auths: RuntimeAuth[],
	): RuntimeAuth | null {
		const now = new Date();
		let available: RuntimeAuth[];
		try {
			available = getAvailableAuths(auths, provider, model, now);
		} catch {
			return null;
		}

		if (available.length === 0) return null;

		const key = `${provider}:${model}`;
		let index = this.cursors.get(key) ?? 0;

		if (index >= 2_147_483_640) {
			index = 0;
		}

		this.cursors.set(key, index + 1);
		return available[index % available.length] ?? null;
	}
}

export class FillFirstSelector implements Selector {
	pick(
		provider: string,
		model: string,
		_opts: ExecutorOptions,
		auths: RuntimeAuth[],
	): RuntimeAuth | null {
		const now = new Date();
		let available: RuntimeAuth[];
		try {
			available = getAvailableAuths(auths, provider, model, now);
		} catch {
			return null;
		}

		return available[0] ?? null;
	}
}
