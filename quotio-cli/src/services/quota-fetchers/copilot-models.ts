import { fetchWithTimeout, readAuthFiles } from "./types.ts";

const TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const MODELS_URL = "https://api.githubcopilot.com/models";

interface CopilotModelInfo {
	id: string;
	name?: string;
	model_picker_enabled?: boolean;
	model_picker_category?: string;
	vendor?: string;
	preview?: boolean;
}

interface CopilotModelsResponse {
	data: CopilotModelInfo[];
}

interface CopilotTokenResponse {
	token: string;
	expires_at?: number;
}

async function fetchCopilotAPIToken(accessToken: string): Promise<string> {
	const response = await fetchWithTimeout({
		url: TOKEN_URL,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!response.ok) {
		throw new Error(`Token fetch failed: HTTP ${response.status}`);
	}

	const data = (await response.json()) as CopilotTokenResponse;
	return data.token;
}

async function fetchModelsFromCopilotAPI(
	apiToken: string,
): Promise<CopilotModelInfo[]> {
	const response = await fetchWithTimeout({
		url: MODELS_URL,
		headers: {
			Authorization: `Bearer ${apiToken}`,
			Accept: "application/json",
			"User-Agent": "GithubCopilot/1.0",
			"Editor-Version": "vscode/1.100.0",
			"Editor-Plugin-Version": "copilot/1.300.0",
		},
	});

	if (!response.ok) {
		throw new Error(`Models fetch failed: HTTP ${response.status}`);
	}

	const data = (await response.json()) as CopilotModelsResponse;
	return data.data ?? [];
}

export class CopilotAvailableModelsFetcher {
	private modelsCache: Map<
		string,
		{ models: CopilotModelInfo[]; expiry: Date }
	> = new Map();
	private readonly cacheTTL = 300_000;

	async fetchAvailableModels(authFilePath: string): Promise<CopilotModelInfo[]> {
		const authFiles = await readAuthFiles("github-copilot-");
		const authFile = authFiles.find((f) => f.path === authFilePath);
		if (!authFile?.accessToken) {
			return [];
		}

		const cached = this.modelsCache.get(authFile.accessToken);
		if (cached && cached.expiry > new Date()) {
			return cached.models;
		}

		try {
			const apiToken = await fetchCopilotAPIToken(authFile.accessToken);
			const models = await fetchModelsFromCopilotAPI(apiToken);

			this.modelsCache.set(authFile.accessToken, {
				models,
				expiry: new Date(Date.now() + this.cacheTTL),
			});

			return models;
		} catch {
			return [];
		}
	}

	async fetchAllAvailableModels(): Promise<CopilotModelInfo[]> {
		const authFiles = await readAuthFiles("github-copilot-");
		if (authFiles.length === 0) {
			return [];
		}

		for (const file of authFiles) {
			if (!file.accessToken) continue;

			const cached = this.modelsCache.get(file.accessToken);
			if (cached && cached.expiry > new Date()) {
				return cached.models;
			}

			try {
				const apiToken = await fetchCopilotAPIToken(file.accessToken);
				const models = await fetchModelsFromCopilotAPI(apiToken);

				this.modelsCache.set(file.accessToken, {
					models,
					expiry: new Date(Date.now() + this.cacheTTL),
				});

				if (models.length > 0) {
					return models;
				}
			} catch {}
		}

		return [];
	}

	async fetchUserAvailableModelIds(): Promise<Set<string>> {
		const models = await this.fetchAllAvailableModels();
		return new Set(
			models.filter((m) => m.model_picker_enabled === true).map((m) => m.id),
		);
	}
}
