import TechSupportApp from '@/components/tech-support-app';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
 const user = await requireChatGPTUser('/');
 return <TechSupportApp displayName={user.displayName}/>;
}
