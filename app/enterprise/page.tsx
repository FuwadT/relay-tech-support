import TechSupportApp from '@/components/tech-support-app';
import { requireChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function EnterprisePage() {
  const user = await requireChatGPTUser('/enterprise');
  return <TechSupportApp displayName={user.displayName} initialView="triage" />;
}
