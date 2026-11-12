import { apiUrl } from '../../lib/api.js';

function outputEvents(output = []) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of output) {
        if (item.type === 'message') {
          const text = (item.content || [])
            .filter((part) => part.type === 'output_text')
            .map((part) => part.text || '')
            .join('');
          if (!text) continue;
          const messageId = item.id || `agentpay-${Date.now()}`;
          yield { type: 'TEXT_MESSAGE_START', messageId };
          yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: text };
          yield { type: 'TEXT_MESSAGE_END', messageId };
        } else if (item.type === 'function_call') {
          const toolCallId = item.call_id || item.id;
          yield { type: 'TOOL_CALL_START', toolCallId, toolCallName: item.name };
          yield { type: 'TOOL_CALL_ARGS', toolCallId, delta: item.arguments || '{}' };
          yield { type: 'TOOL_CALL_END', toolCallId };
        }
      }
    }
  };
}

export function createAgentPayStudioAdapter() {
  return {
    executeTurn(request, options = {}) {
      const complete = fetch(apiUrl('/api/analytics/agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request }),
        signal: options.signal,
        cache: 'no-store'
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'AgentPay analytics assistant failed.');
        return {
          id: payload.id,
          createdAt: payload.created_at ? Number(payload.created_at) * 1000 : Date.now(),
          status: payload.status,
          output: payload.output || [],
          usage: payload.usage,
          model: payload.model,
          error: payload.error || undefined,
          incompleteDetails: payload.incomplete_details
        };
      });

      return {
        stream: {
          async *[Symbol.asyncIterator]() {
            const response = await complete;
            yield* outputEvents(response.output);
          }
        },
        complete
      };
    }
  };
}
