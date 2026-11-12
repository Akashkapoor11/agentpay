export default function BackendHome() {
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 760, margin: '64px auto', padding: '0 24px' }}>
      <h1>AgentPay API</h1>
      <p>The backend service is running. Use <code>/api/health</code> for readiness checks.</p>
    </main>
  );
}
