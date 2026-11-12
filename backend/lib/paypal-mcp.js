import { getPayPalAccessToken } from './paypal.js';

const READ_ONLY_TOOLS = ['list_products', 'show_product_details'];

export async function getPayPalMcpTool() {
  if (process.env.PAYPAL_MCP_ENABLED !== 'true') return null;
  const authorization = await getPayPalAccessToken();
  return {
    type: 'mcp',
    server_label: 'paypal_sandbox_readonly',
    server_description: 'Read-only PayPal Sandbox product-catalog context. Never create, capture, refund, or modify payments through this MCP server.',
    server_url: 'https://mcp.sandbox.paypal.com/http',
    authorization,
    allowed_tools: READ_ONLY_TOOLS,
    require_approval: 'never'
  };
}
