import { EnterpriseChatView } from '@/components/enterprise-chat-view';

export const dynamic = 'force-dynamic';

export default function EnterprisePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f17' }}>
      <EnterpriseChatView
        organizationId="org-pilot-01"
        organizationName="Acme Corp Enterprise Pilot"
        userId="user-test-requester"
        userRole="requester"
      />
    </div>
  );
}
