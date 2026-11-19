import { AudienceType, UserDataFunctions, type RayfinContext } from '@microsoft/fabric-user-data-functions';

const udf = new UserDataFunctions();

/**
 * The published Fabric data agent `ci-data-agent` (grounded on ci-eventhouse), reached through its MCP endpoint.
 * Learn: "Use the Fabric data agent programmatically". These ids are not secrets.
 */
const WORKSPACE_ID = '415f790e-a590-4b59-b30a-c3a70a48de1e';
const DATA_AGENT_ID = '5aae0a2f-0406-4038-90bb-bb033277d2c8';
const MCP_URL = `https://api.fabric.microsoft.com/v1/mcp/workspaces/${WORKSPACE_ID}/dataagents/${DATA_AGENT_ID}/agent`;
const MAX_QUESTION_CHARS = 1000;

interface RpcMessage {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

/** One MCP session over streamable HTTP: JSON-RPC by POST, replies as JSON or as a server-sent event stream. */
class McpSession {
  private nextId = 0;
  private sessionId: string | undefined;

  constructor(private readonly token: string) {}

  async send(method: string, params?: Record<string, unknown>, notify = false): Promise<Record<string, unknown>> {
    const id = notify ? undefined : ++this.nextId;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id ? { id } : {}) }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Data agent returned HTTP ${response.status} on ${method}`);
    }
    this.sessionId = response.headers.get('mcp-session-id') ?? this.sessionId;
    if (notify || !text.trim()) return {};

    const messages: RpcMessage[] = (response.headers.get('content-type') ?? '').includes('text/event-stream')
      ? text.split(/\r?\n/).filter((l) => l.startsWith('data:') && l.slice(5).trim()).map((l) => JSON.parse(l.slice(5)) as RpcMessage)
      : [JSON.parse(text) as RpcMessage];
    const message = messages.find((m) => m.id === id) ?? messages[messages.length - 1];
    if (!message) throw new Error(`Data agent sent no reply to ${method}`);
    if (message.error) throw new Error(`Data agent error on ${method}: ${message.error.message ?? 'unknown'}`);
    return message.result ?? {};
  }
}

/**
 * Asks the data agent one question and returns its answer as text.
 *
 * Runs with the app identity (today: the owner of the Fabric app item), not the signed-in user, so every
 * app user gets answers with the owner's read access to ci-eventhouse. See docs/decisions/002-ask-ai.md.
 */
udf.func(
  'askDataAgent',
  async (question: string, ctx: RayfinContext<Record<string, any>, AudienceType.Fabric>): Promise<string> => {
    const q = (question ?? '').trim();
    if (!q) throw new Error('Enter a question first');
    if (q.length > MAX_QUESTION_CHARS) throw new Error(`Keep the question under ${MAX_QUESTION_CHARS} characters`);

    const started = Date.now();
    const mcp = new McpSession(ctx.Tokens.Fabric);
    await mcp.send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'capacity-insights', version: '0.1' },
    });
    await mcp.send('notifications/initialized', undefined, true);

    const tools = (await mcp.send('tools/list')).tools as { name: string; inputSchema?: { properties?: Record<string, unknown> } }[] | undefined;
    const tool = tools?.[0];
    const argument = tool ? Object.keys(tool.inputSchema?.properties ?? {})[0] : undefined;
    if (!tool || !argument) throw new Error('The data agent exposes no question tool. Check that it is published.');

    const result = await mcp.send('tools/call', { name: tool.name, arguments: { [argument]: q } });
    const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
    const answer = content.filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('\n').trim();
    console.log(`askDataAgent answered in ${Math.round((Date.now() - started) / 1000)} s, ${answer.length} chars`);
    if (result.isError) throw new Error(answer || 'The data agent could not answer');
    return answer || 'The data agent returned no text.';
  },
  [],
);
