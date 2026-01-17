import type { StoredAuthFile } from "../store/types.js";
import type {
	ProviderExecutor,
	ExecutorRequest,
	ExecutorResponse,
	ExecutorOptions,
	StreamChunk,
} from "./types.js";
import { StatusError } from "./types.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_API_VERSION = "v1beta";

interface GeminiExecutorConfig {
	defaultMaxTokens?: number;
}

export class GeminiExecutor implements ProviderExecutor {
	private config: GeminiExecutorConfig;

	constructor(config: GeminiExecutorConfig = {}) {
		this.config = {
			defaultMaxTokens: config.defaultMaxTokens ?? 8192,
		};
	}

	identifier(): string {
		return "gemini";
	}

	async execute(
		auth: StoredAuthFile,
		req: ExecutorRequest,
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse> {
		const { apiKey, bearer, baseUrl } = this.getCredentials(auth);
		const model = this.parseModelName(req.model);
		const action = (req.metadata?.["action"] as string) ?? "generateContent";
		const url = this.buildUrl(baseUrl, model, action, opts.alt);

		const body = this.prepareRequestBody(req, opts);

		const response = await fetch(url, {
			method: "POST",
			headers: this.buildHeaders(apiKey, bearer),
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
		const { apiKey, bearer, baseUrl } = this.getCredentials(auth);
		const model = this.parseModelName(req.model);
		const url = this.buildUrl(baseUrl, model, "streamGenerateContent", "sse");

		const body = this.prepareRequestBody(req, opts);

		const response = await fetch(url, {
			method: "POST",
			headers: this.buildHeaders(apiKey, bearer),
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
			const response = await fetch("https://oauth2.googleapis.com/token", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					client_id:
						"764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com",
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
		opts: ExecutorOptions,
		signal?: AbortSignal,
	): Promise<ExecutorResponse> {
		const modifiedReq = {
			...req,
			metadata: { ...req.metadata, action: "countTokens" },
		};
		return this.execute(auth, modifiedReq, opts, signal);
	}

	async prepareRequest(
		auth: StoredAuthFile,
		request: Request,
	): Promise<Request> {
		const { apiKey, bearer } = this.getCredentials(auth);
		const headers = new Headers(request.headers);

		if (apiKey) {
			headers.set("x-goog-api-key", apiKey);
			headers.delete("Authorization");
		} else if (bearer) {
			headers.set("Authorization", `Bearer ${bearer}`);
			headers.delete("x-goog-api-key");
		}

		headers.set("Content-Type", "application/json");

		return new Request(request.url, {
			method: request.method,
			headers,
			body: request.body,
		});
	}

	private getCredentials(auth: StoredAuthFile): {
		apiKey: string;
		bearer: string;
		baseUrl: string;
	} {
		const apiKey = (auth.tokenData?.["api_key"] as string) ?? "";
		const bearer = auth.accessToken ?? "";
		const baseUrl =
			(auth.tokenData?.["base_url"] as string) ?? GEMINI_API_BASE;

		if (!apiKey && !bearer) {
			throw new StatusError(401, "No API key or access token available");
		}

		return { apiKey, bearer, baseUrl };
	}

	private buildHeaders(
		apiKey: string,
		bearer: string,
	): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (apiKey) {
			headers["x-goog-api-key"] = apiKey;
		} else if (bearer) {
			headers["Authorization"] = `Bearer ${bearer}`;
		}

		return headers;
	}

	private buildUrl(
		baseUrl: string,
		model: string,
		action: string,
		alt?: string,
	): string {
		let url = `${baseUrl}/${GEMINI_API_VERSION}/models/${model}:${action}`;
		if (alt && action !== "countTokens") {
			url += `?$alt=${alt}`;
		}
		return url;
	}

	private prepareRequestBody(
		req: ExecutorRequest,
		_opts: ExecutorOptions,
	): Record<string, unknown> {
		const body = this.parsePayload(req.payload);
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
