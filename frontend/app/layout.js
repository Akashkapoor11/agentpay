import './globals.css';

export const metadata = {
  title: 'AgentPay — Trust Layer for AI Commerce',
  description: 'A policy-controlled agentic commerce prototype powered by PayPal Sandbox and AI.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
