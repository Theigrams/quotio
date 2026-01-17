import type { StoredAuthFile } from "../store/types.js";
import type {
	ProviderExecutor,
	ExecutorRequest,
	ExecutorResponse,
	ExecutorOptions,
	StreamChunk,
} from "./types.js";
import { StatusError } from "./types.js";

const CLAUDE_API_BASE = "https://api.anthropic.com";
const CLAUDE_API_VERSION = "2023-06-01";

interface ClaudeExecutorConfig {
	defaultMaxTokens?: number;
}

export class ClaudeExecutor implements ProviderExecutor {
	private config: ClaudeExecutorConfig;

	constructor(config: ClaudeExecutorConfig = {}) {
		this.config = {
			defaultMaxTokens: config.defaultMaxTokens ?? 8192,
		};
	}

	identifier(): string {
		return "claude";
	}

	async execute(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse> {
		const { apiKey, baseUrl } = this.getCredentials(auth);
		const url = `${baseUrl}/v1/messages`;

		const body = this.prepareRequestBody(req, opts);

		const response = await fetch(url, {
			method: "POST",
			headers: this.buildHeaders(auth, apiKey, false),
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new StatusError(
				response.status,
				errorText,
				this.extractRetryAfterHeader(response),
			);
		}

		const data = await response.arrayBuffer();
		return { payload: new Uint8Array(data) };
	}

	async *executeStream(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): AsyncGenerator<StreamChunk> {
		const { apiKey, baseUrl } = this.getCredentials(auth);
		const url = `${baseUrl}/v1/messages`;

		const body = this.prepareRequestBody(req, opts);
		body.stream = true;

		const response = await fetch(url, {
			method: "POST",
			headers: this.buildHeaders(auth, apiKey, true),
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new StatusError(
				response.status,
				errorText,
				this.extractRetryAfterHeader(response),
			);
		}

		if (!response.body) {
			throw new StatusError(500, "No response body for streaming");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				yield { payload: new TextEncoder().encode(chunk) };
			}
		} catch (err) {
			yield { error: err instanceof Error ? err : new Error(String(err)) };
		} finally {
			reader.releaseLock();
		}
	}

	async refresh(auth: StoredAuthFile): Promise<StoredAuthFile> {
		const refreshToken = auth.refreshToken;
		if (!refreshToken) {
			return auth;
		}

		try {
			const response = await fetch("https://api.anthropic.com/oauth/token", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
				}),
			});

			if (!response.ok) {
				return {
					...auth,
					status: "error",
					statusMessage: "Token refresh failed",
					updatedAt: new Date().toISOString(),
				};
			}

			const data = (await response.json()) as {
				access_token: string;
				refresh_token?: string;
				expires_in?: number;
			};

			const now = new Date();
			const expiresAt = data.expires_in
				? new Date(now.getTime() + data.expires_in * 1000)
				: undefined;

			return {
				...auth,
				accessToken: data.access_token,
				refreshToken: data.refresh_token ?? refreshToken,
				expiresAt: expiresAt?.toISOString(),
				status: "ready",
				statusMessage: undefined,
				updatedAt: now.toISOString(),
			};
		} catch {
			return {
				...auth,
				status: "error",
				statusMessage: "Token refresh failed",
				updatedAt: new Date().toISOString(),
			};
		}
	}

	async countTokens(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		_opts: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse> {
		const { apiKey, baseUrl } = this.getCredentials(auth);
		const url = `${baseUrl}/v1/messages/count_tokens`;

		const body = this.parsePayload(req.payload);
		body.model = req.model;

		const response = await fetch(url, {
			method: "POST",
			headers: this.buildHeaders(auth, apiKey, false),
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new StatusError(response.status, errorText);
		}

		const data = await response.arrayBuffer();
		return { payload: new Uint8Array(data) };
	}

	async prepareRequest(
		auth: StoredAuthFile,
		request: Request,
	): Promise<Request> {
		const { apiKey } = this.getCredentials(auth);
		const headers = new Headers(request.headers);

		const isAnthropicBase =
			request.url.startsWith("https://api.anthropic.com");
		const useApiKey = !!auth.tokenData?.["api_key"];

		if (isAnthropicBase && useApiKey) {
			headers.delete("Authorization");
			headers.set("x-api-key", apiKey);
		} else {
			headers.delete("x-api-key");
			headers.set("Authorization", `Bearer ${apiKey}`);
		}

		headers.set("anthropic-version", CLAUDE_API_VERSION);
		headers.set("Content-Type", "application/json");

		return new Request(request.url, {
			method: request.method,
			headers,
			body: request.body,
		});
	}

	private getCredentials(auth: StoredAuthFile): {
		apiKey: string;
		baseUrl: string;
	} {
		const apiKey =
			(auth.tokenData?.["api_key"] as string) ?? auth.accessToken ?? "";
		const baseUrl =
			(auth.tokenData?.["base_url"] as string) ?? CLAUDE_API_BASE;

		if (!apiKey) {
			throw new StatusError(401, "No API key or access token available");
		}

		return { apiKey, baseUrl };
	}

	private buildHeaders(
		auth: StoredAuthFile,
		apiKey: string,
		stream: boolean,
	): Record<string, string> {
		const isApiKey = !!auth.tokenData?.["api_key"];
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"anthropic-version": CLAUDE_API_VERSION,
		};

		if (isApiKey) {
			headers["x-api-key"] = apiKey;
		} else {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}

		if (stream) {
			headers["Accept"] = "text/event-stream";
		}

		return headers;
	}

	private prepareRequestBody(
		req: ExecutorRequest,
		opts: ExecutorOptions,
	): Record<string, unknown> {
		const body = this.parsePayload(req.payload);

		body.model = this.parseModelName(req.model);

		if (!body.max_tokens && this.config.defaultMaxTokens) {
			body.max_tokens = this.config.defaultMaxTokens;
		}

		if (opts.stream) {
			body.stream = true;
		}

		return body;
	}

	private parsePayload(payload: Uint8Array): Record<string, unknown> {
		try {
			const text = new TextDecoder().decode(payload);
			return JSON.parse(text) as Record<string, unknown>;
		} catch {
			return {};
		}
	}

	private parseModelName(model: string): string {
		const match = model.match(/^(.+?)(?:\(.*\))?$/);
		return match?.[1] ?? model;
	}

	private extractRetryAfterHeader(
		response: Response,
	): Record<string, string> | undefined {
		const retryAfter = response.headers.get("retry-after");
		if (retryAfter) {
			return { "retry-after": retryAfter };
		}
		return undefined;
	}
}
