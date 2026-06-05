import { Buffer } from 'node:buffer';
import { config } from '../config';
import { captureUrl } from '../integrations/routes';
import { withDestinationAccessToken } from '../oauth/destination-tokens';

export interface DeliverPayload {
  captureId: string;
  workspaceId: string;
  imageBase64: string;
  filename: string;
  config: Record<string, unknown>;
  metadata: {
    tag: string | null;
    ocrText: string;
    hasPii: boolean;
    createdAt: number;
  };
}
export interface DeliverResult { ok: boolean; detail: string; url?: string; queued?: boolean; }

export interface ServerDestination {
  id: string;
  deliver(accountId: string, payload: DeliverPayload): Promise<DeliverResult>;
}

const slack: ServerDestination = {
  id: 'slack',
  async deliver(accountId, payload) {
    const channelId = requiredString(payload.config.channel_id, 'Slack channel');
    return withDestinationAccessToken(accountId, 'slack', async token => {
      const bytes = Buffer.from(payload.imageBase64, 'base64');
      const comment = [
        `Tag: ${payload.metadata.tag ?? 'untagged'}`,
        `Timestamp: ${new Date(payload.metadata.createdAt).toISOString()}`,
        `PII redaction: ${payload.metadata.hasPii ? 'redacted' : 'clear'}`,
      ].join(' • ');

      const init = await slackApi<any>('/files.getUploadURLExternal', token.accessToken, {
        filename: `${payload.filename}.png`,
        length: String(bytes.length),
      });
      const uploadUrl = requiredString(init.upload_url, 'Slack upload URL');
      const fileId = requiredString(init.file_id, 'Slack file id');

      const upload = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: bytes,
      });
      if (!upload.ok) throw new Error(`Slack upload failed (${upload.status})`);

      const complete = await slackApi<any>('/files.completeUploadExternal', token.accessToken, {
        files: JSON.stringify([{ id: fileId, title: payload.filename }]),
        channel_id: channelId,
        initial_comment: comment,
      });
      const permalink = typeof complete.files?.[0]?.permalink === 'string' ? complete.files[0].permalink : undefined;
      return {
        ok: true,
        detail: `Delivered to Slack`,
        url: permalink,
      };
    });
  },
};

const notion: ServerDestination = {
  id: 'notion',
  async deliver(accountId, payload) {
    const pageId = requiredString(payload.config.page_id, 'Notion page');
    const externalUrl = captureUrl(accountId, payload.captureId);
    return withDestinationAccessToken(accountId, 'notion', async token => {
      const body = {
        children: [
          {
            object: 'block',
            type: 'image',
            image: {
              type: 'external',
              external: { url: externalUrl },
            },
          },
          {
            object: 'block',
            type: 'callout',
            callout: {
              icon: { emoji: '📸' },
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: [
                      `Captured ${new Date(payload.metadata.createdAt).toISOString()}`,
                      `Tag: ${payload.metadata.tag ?? 'untagged'}`,
                      `OCR words: ${wordCount(payload.metadata.ocrText)}`,
                      `PII redaction: ${payload.metadata.hasPii ? 'redacted' : 'clear'}`,
                    ].join(' | '),
                  },
                },
              ],
            },
          },
        ],
      };
      await notionApi(`/v1/blocks/${encodeURIComponent(pageId)}/children`, token.accessToken, body);
      return { ok: true, detail: 'Delivered to Notion', url: externalUrl };
    });
  },
};

const gmail: ServerDestination = {
  id: 'gmail',
  async deliver(accountId, payload) {
    const recipients = normaliseRecipients(payload.config.recipients);
    if (!recipients.length) throw new Error('Add at least one Gmail recipient');
    const bytes = Buffer.from(payload.imageBase64, 'base64');
    if (bytes.length > 25 * 1024 * 1024) throw new Error('Attachment exceeds Gmail’s 25 MB limit');
    return withDestinationAccessToken(accountId, 'gmail', async token => {
      const tag = payload.metadata.tag ?? 'untagged';
      const timestamp = new Date(payload.metadata.createdAt).toISOString();
      const subject = `SnapFlow capture — ${tag} — ${timestamp}`;
      const bodyText = [
        `Tag: ${tag}`,
        `Timestamp: ${timestamp}`,
        `PII redaction: ${payload.metadata.hasPii ? 'redacted' : 'clear'}`,
        `OCR word count: ${wordCount(payload.metadata.ocrText)}`,
        '',
        'Sent from SnapFlow',
      ].join('\n');
      const raw = toBase64Url(mimeMessage({
        to: recipients.join(', '),
        subject,
        bodyText,
        filename: `${payload.filename}.png`,
        attachmentBase64: payload.imageBase64,
      }));
      await gmailApi('/gmail/v1/users/me/messages/send', token.accessToken, { raw });
      return { ok: true, detail: `Delivered to ${recipients.join(', ')}` };
    });
  },
};

const github: ServerDestination = {
  id: 'github',
  async deliver(accountId, payload) {
    const owner = requiredString(payload.config.owner, 'GitHub owner');
    const repo = requiredString(payload.config.repo, 'GitHub repo');
    const mode = payload.config.mode === 'comment' ? 'comment' : 'create';
    const tag = payload.metadata.tag ?? 'untagged';
    const timestamp = new Date(payload.metadata.createdAt).toISOString();
    const imageUrl = captureUrl(accountId, payload.captureId);
    const body = [
      `![SnapFlow capture](${imageUrl})`,
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| Tag | ${tag} |`,
      `| Timestamp | ${timestamp} |`,
      `| PII status | ${payload.metadata.hasPii ? 'Redacted' : 'Clear'} |`,
      `| OCR excerpt | ${escapeCell(payload.metadata.ocrText.trim().slice(0, 200) || 'None')} |`,
    ].join('\n');
    return withDestinationAccessToken(accountId, 'github', async token => {
      if (mode === 'comment') {
        const issueNumber = Number(payload.config.issue_number);
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('Issue number not found');
        await githubApi(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token.accessToken, { body });
        return { ok: true, detail: `Commented on ${owner}/${repo}#${issueNumber}`, url: imageUrl };
      }
      const title = `[SnapFlow] ${tag} — ${timestamp}`;
      const json = await githubApi<{ html_url?: string }>(`/repos/${owner}/${repo}/issues`, token.accessToken, {
        title,
        body,
      });
      return { ok: true, detail: `Created issue in ${owner}/${repo}`, url: json.html_url ?? imageUrl };
    });
  },
};

const jira: ServerDestination = {
  id: 'jira',
  async deliver(accountId, payload) {
    const issueKey = optionalString(payload.config.issue_key);
    const projectKey = optionalString(payload.config.project_key);
    if (!issueKey && !projectKey) throw new Error('Add an issue key or project key for Jira delivery');

    return withDestinationAccessToken(accountId, 'jira', async token => {
      const site = await resolveJiraSite(token.accessToken, token.profile?.meta);
      const apiBase = jiraApiBase(site.cloudId);
      const captureLink = captureUrl(accountId, payload.captureId);
      const commentText = jiraComment(payload, captureLink);

      const upload = async (targetKey: string) => {
        await uploadAttachment(apiBase, token.accessToken, targetKey, payload.filename, payload.imageBase64);
        await addComment(apiBase, token.accessToken, targetKey, commentText);
      };

      if (issueKey) {
        await upload(issueKey);
        return { ok: true, detail: `Attached to ${issueKey}`, url: captureLink };
      }

      const summary = requiredString(payload.config.issue_summary, 'Jira issue summary');
      const description = optionalString(payload.config.issue_description) ?? commentText;
      const created = await createIssue(apiBase, token.accessToken, projectKey!, summary, description);
      await upload(created.key);
      return { ok: true, detail: `Created ${created.key}`, url: captureLink };
    });
  },
};

const REGISTRY: Record<string, ServerDestination> = {
  slack,
  notion,
  gmail,
  github,
  jira,
};

export const getServerDestination = (id: string): ServerDestination | undefined => REGISTRY[id];

async function slackApi<T>(path: string, accessToken: string, body: Record<string, string>, attempt = 0): Promise<T> {
  const res = await fetch(`${config.slackApiBase}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  if (res.status === 429 && attempt < 2) {
    const retryMs = (Number(res.headers.get('retry-after') ?? 1) || 1) * 1000 * (attempt + 1);
    await delay(retryMs);
    return slackApi<T>(path, accessToken, body, attempt + 1);
  }
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json.ok) throw new Error(String(json.error ?? `Slack request failed (${res.status})`));
  return json as T;
}

async function notionApi(path: string, accessToken: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${config.notionApiBase}${path}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'notion-version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(json.message ?? `Notion request failed (${res.status})`);
}

async function gmailApi(path: string, accessToken: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${config.gmailApiBase}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Gmail request failed (${res.status})`);
}

async function githubApi<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.githubApiBase}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'SnapFlow',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(String((json as { message?: string }).message ?? `GitHub request failed (${res.status})`));
  return json;
}

function mimeMessage(input: { to: string; subject: string; bodyText: string; filename: string; attachmentBase64: string }): string {
  const boundary = `snapflow-${Date.now().toString(16)}`;
  return [
    'MIME-Version: 1.0',
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.bodyText,
    '',
    `--${boundary}`,
    `Content-Type: image/png; name="${input.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${input.filename}"`,
    '',
    input.attachmentBase64,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function toBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function normaliseRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

function wordCount(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveJiraSite(accessToken: string, meta?: Record<string, unknown>): Promise<{ cloudId: string; url?: string }> {
  const fromMeta = meta?.cloudId && typeof meta.cloudId === 'string' ? { cloudId: meta.cloudId, url: typeof meta.url === 'string' ? meta.url : undefined } : null;
  if (fromMeta) return fromMeta;
  const resources = await fetch(`${config.jiraApiBase}/oauth/token/accessible-resources`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
  const json = (await resources.json().catch(() => [])) as Array<{ id?: string; url?: string }>;
  const site = json.find(item => typeof item.id === 'string');
  if (!resources.ok || !site) throw new Error('No accessible Jira site found for this account');
  return { cloudId: site.id!, url: site.url };
}

function jiraApiBase(cloudId: string): string {
  return `${config.jiraApiBase}/ex/jira/${encodeURIComponent(cloudId)}`;
}

async function uploadAttachment(apiBase: string, accessToken: string, issueKey: string, filename: string, imageBase64: string): Promise<void> {
  const bytes = Buffer.from(imageBase64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([bytes]), `${filename}.png`);
  const res = await fetch(`${apiBase}/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'X-Atlassian-Token': 'no-check',
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira attachment failed (${res.status}) ${text}`);
  }
}

async function addComment(apiBase: string, accessToken: string, issueKey: string, body: string): Promise<void> {
  const res = await fetch(`${apiBase}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ body: jiraDoc(body) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira comment failed (${res.status}) ${text}`);
  }
}

async function createIssue(apiBase: string, accessToken: string, projectKey: string, summary: string, description: string): Promise<{ key: string }> {
  const res = await fetch(`${apiBase}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary,
        description: jiraDoc(description),
        issuetype: { name: 'Task' },
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { key?: string; errorMessages?: string[] };
  if (!res.ok || !json.key) throw new Error(String(json.errorMessages?.[0] ?? `Jira issue create failed (${res.status})`));
  return { key: json.key };
}

function jiraDoc(text: string): Record<string, unknown> {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

function jiraComment(payload: DeliverPayload, captureLink: string): string {
  const tag = payload.metadata.tag ?? 'untagged';
  const timestamp = new Date(payload.metadata.createdAt).toISOString();
  return [
    `Capture: ${payload.filename}`,
    `Tag: ${tag}`,
    `Timestamp: ${timestamp}`,
    `PII redaction: ${payload.metadata.hasPii ? 'redacted' : 'clear'}`,
    `OCR words: ${wordCount(payload.metadata.ocrText)}`,
    `Capture link: ${captureLink}`,
  ].join(' | ');
}
