import { readFileSync } from 'node:fs';
import type { Capture, DeliverResult, DestinationId, IntegrationOption, IntegrationStatus } from '../../shared/types';

type JsonRecord = Record<string, unknown>;

export class IntegrationBackendClient {
  constructor(private baseUrl?: string, private token?: string) {}

  get configured(): boolean {
    return !!(this.baseUrl && this.token);
  }

  async getOAuthUrl(destination: DestinationId, params: Record<string, string> = {}): Promise<string> {
    const response = await this.request<{ url?: string }>(`/v1/integrations/${encodeURIComponent(destination)}/oauth-url`, {
      method: 'POST',
      body: params,
    });
    if (!response.url) throw new Error('Unable to create OAuth URL');
    return response.url;
  }

  async deliver(destination: DestinationId, capture: Capture, config: Record<string, unknown>): Promise<DeliverResult> {
    const response = await this.request<JsonRecord>('/v1/deliver', {
      method: 'POST',
      body: {
        destination,
        captureId: capture.id,
        workspaceId: capture.workspaceId,
        filename: capture.filename,
        imageBase64: readFileSync(capture.imagePath).toString('base64'),
        config,
        metadata: {
          tag: capture.tag,
          ocrText: capture.ocrText,
          hasPii: capture.hasPii,
          createdAt: capture.createdAt,
        },
      },
    });
    return toDeliverResult(response);
  }

  async getStatuses(): Promise<IntegrationStatus[]> {
    return this.request<IntegrationStatus[]>('/v1/integrations/statuses');
  }

  async getSlackChannels(): Promise<IntegrationOption[]> {
    return this.request<IntegrationOption[]>('/v1/integrations/slack/channels');
  }

  async searchNotionPages(query: string): Promise<IntegrationOption[]> {
    return this.request<IntegrationOption[]>(`/v1/integrations/notion/pages?q=${encodeURIComponent(query)}`);
  }

  async getGmailProfile(): Promise<{ email: string }> {
    return this.request<{ email: string }>('/v1/integrations/gmail/profile');
  }

  async listGithubRepos(query: string): Promise<IntegrationOption[]> {
    return this.request<IntegrationOption[]>(`/v1/integrations/github/repos?q=${encodeURIComponent(query)}`);
  }

  async getCaptureUrl(captureId: string): Promise<string | null> {
    try {
      const json = await this.request<{ url?: string }>(`/v1/integrations/capture-url/${encodeURIComponent(captureId)}`);
      return typeof json.url === 'string' ? json.url : null;
    } catch (error) {
      if (error instanceof Error && (/404/.test(error.message) || /not found/i.test(error.message))) return null;
      throw error;
    }
  }

  private async request<T>(path: string, init: { method?: string; body?: JsonRecord } = {}): Promise<T> {
    if (!this.baseUrl || !this.token) throw new Error('SnapFlow backend is not configured');
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as JsonRecord;
    if (!res.ok) throw new Error(String(json.message ?? json.detail ?? `Request failed (${res.status})`));
    return json as T;
  }
}

function toDeliverResult(json: JsonRecord): DeliverResult {
  return {
    ok: !!json.ok,
    detail: String(json.detail ?? (json.ok ? 'Delivered' : 'Delivery failed')),
    url: typeof json.url === 'string' ? json.url : undefined,
    queued: !!json.queued,
  };
}

export const integrationBackendClientFromEnv = (): IntegrationBackendClient =>
  new IntegrationBackendClient(process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL, process.env.SNAPFLOW_API_TOKEN);
